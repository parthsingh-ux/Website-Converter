<?php
/**
 * Bundled component: Gutenberg Converter Runtime
 * Description: Imports converted block patterns and external CSS/JS while preserving source markup.
 * Version: 2.1.0
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function gcb_can_import() {
    return current_user_can( 'manage_options' ) && current_user_can( 'unfiltered_html' );
}
function gcb_register_blocks() {
    wp_register_script( 'gcb-blocks', plugins_url( 'assets/blocks.js', __FILE__ ), array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components' ), '2.1.0', true );
    $common = array(
        'api_version' => 3,
        'editor_script' => 'gcb-blocks',
        'supports' => array( 'html' => false, 'customClassName' => true, 'anchor' => false, 'color' => false, 'typography' => false, 'spacing' => false, 'layout' => false ),
        'attributes' => array(
            'tagName' => array( 'type' => 'string', 'default' => 'div' ),
            'htmlAttributes' => array( 'type' => 'object', 'default' => new stdClass() ),
            'className' => array( 'type' => 'string' ),
        ),
    );
    register_block_type( 'gcb/element', $common );
    $text = $common;
    $text['attributes']['content'] = array( 'type' => 'string', 'default' => '' );
    register_block_type( 'gcb/text', $text );
    $image = $common;
    unset( $image['attributes']['tagName'] );
    register_block_type( 'gcb/image', $image );
    register_block_type( 'gcb/markup', array(
        'api_version' => 3,
        'editor_script' => 'gcb-blocks',
        'supports' => array( 'html' => false, 'customClassName' => false, 'className' => false ),
        'attributes' => array( 'content' => array( 'type' => 'string', 'default' => '' ) ),
    ) );
}
add_action( 'init', 'gcb_register_blocks' );

function gcb_menu() {
    add_management_page( 'Gutenberg Converter Import', 'Gutenberg Converter Import', 'manage_options', 'gcb-import', 'gcb_import_page' );
}
add_action( 'admin_menu', 'gcb_menu' );
function gcb_import_page() {
    if ( ! gcb_can_import() ) {
        wp_die( esc_html__( 'Importing source HTML and JavaScript requires an administrator with unfiltered HTML permission.', 'converter-studio-bridge' ) );
    }
    echo '<div class="wrap"><h1>Gutenberg Converter Import</h1><p>Choose the JSON export from Gutenberg Converter 2. The importer saves its CSS and JavaScript as external files and creates an unsynced pattern.</p><p>Upload referenced images separately and set their real URLs in the converter. Existing page copies are not replaced when importing a new revision.</p><input id="gcb-file" type="file" accept=".json,application/json"><p><button id="gcb-import-button" class="button button-primary" type="button">Import pattern and assets</button></p><p id="gcb-status" role="status" aria-live="polite"></p></div>';
}
function gcb_admin_assets( $hook ) {
    if ( 'tools_page_gcb-import' !== $hook ) { return; }
    wp_enqueue_script( 'gcb-import', plugins_url( 'assets/import.js', __FILE__ ), array( 'gcb-blocks', 'wp-block-library' ), '2.1.0', true );
    wp_localize_script( 'gcb-import', 'gcbImport', array( 'restUrl' => rest_url( 'gcb/v1/import' ), 'nonce' => wp_create_nonce( 'wp_rest' ) ) );
}
add_action( 'admin_enqueue_scripts', 'gcb_admin_assets' );
function gcb_routes() {
    register_rest_route( 'gcb/v1', '/import', array( 'methods' => 'POST', 'callback' => 'gcb_import_bundle', 'permission_callback' => 'gcb_can_import' ) );
}
add_action( 'rest_api_init', 'gcb_routes' );

function gcb_check_blocks( $blocks, $depth = 0 ) {
    if ( $depth > 64 ) { return false; }
    $allowed = array( 'core/heading', 'core/paragraph', 'core/html', 'gcb/element', 'gcb/text', 'gcb/image', 'gcb/markup' );
    foreach ( $blocks as $block ) {
        if ( ! $block['blockName'] && ! trim( $block['innerHTML'] ) ) { continue; }
        if ( ! in_array( $block['blockName'], $allowed, true ) || ! gcb_check_blocks( $block['innerBlocks'], $depth + 1 ) ) { return false; }
    }
    return true;
}
function gcb_write_asset( $file, $bytes ) {
    if ( file_exists( $file ) && hash_equals( hash( 'sha256', $bytes ), hash_file( 'sha256', $file ) ) ) {
        return true;
    }
    if ( ! function_exists( 'wp_tempnam' ) ) { require_once ABSPATH . 'wp-admin/includes/file.php'; }
    $temp = wp_tempnam( basename( $file ), dirname( $file ) );
    if ( ! $temp ) {
        return file_put_contents( $file, $bytes, LOCK_EX ) === strlen( $bytes );
    }
    $written = file_put_contents( $temp, $bytes, LOCK_EX );
    if ( strlen( $bytes ) !== $written || ! rename( $temp, $file ) ) {
        if ( file_exists( $temp ) ) { wp_delete_file( $temp ); }
        return file_put_contents( $file, $bytes, LOCK_EX ) === strlen( $bytes );
    }
    return true;
}
function gcb_import_bundle( $request ) {
    $d = $request->get_json_params();
    if ( ! is_array( $d ) || ( $d['format'] ?? '' ) !== 'gcb-bundle' || ( $d['formatVersion'] ?? 0 ) !== 1 ) {
        return new WP_Error( 'gcb_format', 'Use a JSON export from Gutenberg Converter 2.', array( 'status' => 400 ) );
    }
    foreach ( array( 'patternScopeId', 'content', 'patternCss', 'patternJs', 'title' ) as $key ) {
        if ( ! isset( $d[ $key ] ) || ! is_string( $d[ $key ] ) || strlen( $d[ $key ] ) > 4 * MB_IN_BYTES ) {
            return new WP_Error( 'gcb_field', 'Missing, invalid or oversized field: ' . $key, array( 'status' => 400 ) );
        }
    }
    $id = $d['patternScopeId'];
    if ( ! preg_match( '/^gcb-[a-f0-9]{16}$/D', $id ) || ! empty( $d['manifest']['unresolvedDependencies'] ) ) {
        return new WP_Error( 'gcb_dependencies', 'Invalid asset ID or unresolved source dependencies.', array( 'status' => 400 ) );
    }
    $blocks = parse_blocks( $d['content'] );
    $root_classes = preg_split( '/\s+/', $blocks[0]['attrs']['className'] ?? '' );
    if ( ! gcb_check_blocks( $blocks ) || ( $blocks[0]['blockName'] ?? '' ) !== 'gcb/element' || ! in_array( $id, $root_classes, true ) || ! in_array( 'gcb-scope', $root_classes, true ) || preg_match( '/<(?:style|script)\b|<[a-z][^>]*\sstyle\s*=/i', $d['content'] ) ) {
        return new WP_Error( 'gcb_content', 'The pattern has invalid blocks, missing scope or embedded styles/scripts.', array( 'status' => 400 ) );
    }
    $uploads = wp_upload_dir();
    if ( $uploads['error'] ) { return new WP_Error( 'gcb_uploads', $uploads['error'], array( 'status' => 500 ) ); }
    $dir = trailingslashit( $uploads['basedir'] ) . 'gutenberg-converter';
    if ( ! wp_mkdir_p( $dir ) ) { return new WP_Error( 'gcb_directory', 'Could not create the converted asset directory.', array( 'status' => 500 ) ); }
    $registry = get_option( 'gcb_asset_registry', array() );
    $asset_hash = hash( 'sha256', $d['patternCss'] . "\0" . $d['patternJs'] );
    if ( isset( $registry[ $id ] ) && $registry[ $id ]['asset_hash'] !== $asset_hash ) {
        return new WP_Error( 'gcb_revision', 'This ID belongs to different assets. Regenerate the conversion to create a new revision.', array( 'status' => 409 ) );
    }
    if ( ! gcb_write_asset( $dir . '/' . $id . '.css', $d['patternCss'] ) || ( trim( $d['patternJs'] ) && ! gcb_write_asset( $dir . '/' . $id . '.js', $d['patternJs'] ) ) ) {
        return new WP_Error( 'gcb_write', 'Could not save the external assets. Check uploads directory permissions and regenerate if an older file conflicts.', array( 'status' => 500 ) );
    }
    $post = array( 'post_type' => 'wp_block', 'post_status' => 'publish', 'post_title' => sanitize_text_field( $d['title'] ), 'post_content' => $d['content'] );
    if ( isset( $registry[ $id ]['pattern_id'] ) && 'wp_block' === get_post_type( $registry[ $id ]['pattern_id'] ) ) { $post['ID'] = $registry[ $id ]['pattern_id']; }
    $post_id = wp_insert_post( wp_slash( $post ), true );
    if ( is_wp_error( $post_id ) ) { return $post_id; }
    update_post_meta( $post_id, 'wp_pattern_sync_status', 'unsynced' );
    update_post_meta( $post_id, '_gcb_asset_id', $id );
    $registry[ $id ] = array( 'asset_hash' => $asset_hash, 'has_js' => (bool) trim( $d['patternJs'] ), 'pattern_id' => $post_id, 'title' => $post['post_title'] );
    update_option( 'gcb_asset_registry', $registry, false );
    return rest_ensure_response( array( 'patternId' => $post_id, 'title' => $post['post_title'], 'editUrl' => admin_url( 'post.php?post=' . $post_id . '&action=edit' ) ) );
}

function gcb_ids_in_blocks( $blocks, &$ids, &$seen, $depth = 0 ) {
    if ( $depth > 64 ) { return; }
    $registry = get_option( 'gcb_asset_registry', array() );
    foreach ( $blocks as $block ) {
        $classes = preg_split( '/\s+/', $block['attrs']['className'] ?? '' );
        foreach ( $classes as $class ) { if ( isset( $registry[ $class ] ) ) { $ids[ $class ] = true; } }
        if ( 'core/block' === $block['blockName'] && ! empty( $block['attrs']['ref'] ) && empty( $seen[ $block['attrs']['ref'] ] ) ) {
            $seen[ $block['attrs']['ref'] ] = true;
            $post = get_post( $block['attrs']['ref'] );
            if ( $post ) { gcb_ids_in_blocks( parse_blocks( $post->post_content ), $ids, $seen, $depth + 1 ); }
        }
        gcb_ids_in_blocks( $block['innerBlocks'], $ids, $seen, $depth + 1 );
    }
}
function gcb_enqueue_id( $id, $frontend = true ) {
    $registry = get_option( 'gcb_asset_registry', array() );
    if ( ! isset( $registry[ $id ] ) ) { return; }
    $uploads = wp_upload_dir();
    $url = trailingslashit( $uploads['baseurl'] ) . 'gutenberg-converter/' . $id;
    wp_enqueue_style( $id, $url . '.css', array(), $registry[ $id ]['asset_hash'] );
    if ( $frontend && $registry[ $id ]['has_js'] ) { wp_enqueue_script( $id, $url . '.js', array(), $registry[ $id ]['asset_hash'], true ); }
}
function gcb_enqueue_assets() {
    $registry = get_option( 'gcb_asset_registry', array() );
    if ( is_admin() ) {
        // All imported CSS is available for new insertions and pattern previews.
        foreach ( array_keys( $registry ) as $id ) { gcb_enqueue_id( $id, false ); }
        return;
    }
    global $wp_query;
    $ids = $seen = array();
    foreach ( (array) ( $wp_query->posts ?? array() ) as $post ) {
        if ( $post instanceof WP_Post ) { gcb_ids_in_blocks( parse_blocks( $post->post_content ), $ids, $seen ); }
    }
    foreach ( array_keys( $ids ) as $id ) { gcb_enqueue_id( $id ); }
}
add_action( 'enqueue_block_assets', 'gcb_enqueue_assets', 20 );
function gcb_render_assets( $content, $block ) {
    if ( is_admin() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) { return $content; }
    $registry = get_option( 'gcb_asset_registry', array() );
    foreach ( preg_split( '/\s+/', $block['attrs']['className'] ?? '' ) as $id ) {
        if ( ! isset( $registry[ $id ] ) ) { continue; }
        gcb_enqueue_id( $id );
        // Covers template parts and dynamically rendered content absent from the
        // main query. Output an external link once, never an inline stylesheet.
        if ( did_action( 'wp_head' ) && ! wp_style_is( $id, 'done' ) ) {
            ob_start(); wp_print_styles( array( $id ) ); $content = ob_get_clean() . $content;
        }
    }
    return $content;
}
add_filter( 'render_block', 'gcb_render_assets', 20, 2 );
