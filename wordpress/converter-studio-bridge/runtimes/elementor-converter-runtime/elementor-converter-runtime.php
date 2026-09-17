<?php
/**
 * Bundled component: Elementor Converter Runtime
 * Description: Imports native Elementor Free/Pro templates and their external design assets.
 * Version: 1.1.1
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }
function ecb_can_import() { return current_user_can( 'manage_options' ) && current_user_can( 'unfiltered_html' ); }
function ecb_ready() { return did_action( 'elementor/loaded' ) && class_exists( '\Elementor\Plugin' ); }
add_action( 'admin_menu', function () { add_management_page( 'Elementor Converter Import', 'Elementor Converter Import', 'manage_options', 'ecb-import', 'ecb_import_page' ); } );
function ecb_import_page() {
    if ( ! ecb_can_import() ) { wp_die( 'Importing source HTML and JavaScript requires administrator and unfiltered HTML permissions.' ); }
    echo '<div class="wrap"><h1>Elementor Converter Import</h1><p>Import a converter JSON as a new draft template, with its external CSS and JavaScript. Existing pages are not replaced.</p>';
    if ( ! ecb_ready() ) { echo '<p>Activate Elementor before importing.</p></div>'; return; }
    echo '<p>Elementor version: ' . esc_html( ELEMENTOR_VERSION ) . '. Pro: ' . ( defined( 'ELEMENTOR_PRO_VERSION' ) ? esc_html( ELEMENTOR_PRO_VERSION ) : 'not active' ) . '.</p><input id="ecb-file" type="file" accept=".json,application/json"><p><button id="ecb-import" type="button" class="button button-primary">Import template and assets</button></p><p id="ecb-status" role="status" aria-live="polite"></p><pre id="ecb-notes" style="white-space:pre-wrap"></pre></div>';
}
add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( 'tools_page_ecb-import' !== $hook ) { return; }
    wp_enqueue_script( 'ecb-import', plugins_url( 'assets/import.js', __FILE__ ), array(), '1.1.1', true );
    wp_localize_script( 'ecb-import', 'ecbImport', array( 'url' => rest_url( 'ecb/v1/import' ), 'nonce' => wp_create_nonce( 'wp_rest' ) ) );
} );
add_action( 'rest_api_init', function () { register_rest_route( 'ecb/v1', '/import', array( 'methods' => 'POST', 'callback' => 'ecb_import_bundle', 'permission_callback' => 'ecb_can_import' ) ); } );
function ecb_error( $message, $status = 400 ) { return new WP_Error( 'ecb_import', $message, array( 'status' => $status ) ); }
function ecb_check_tree( $nodes, $edition, &$ids, &$count, $depth = 0 ) {
    if ( ! is_array( $nodes ) || $depth > 64 ) { return ecb_error( 'Invalid or excessively nested element tree.' ); }
    $allowed = array( 'heading', 'text-editor', 'button', 'image', 'icon', 'html', 'form' );
    foreach ( $nodes as $node ) {
        if ( ++$count > 5000 || ! is_array( $node ) || ! preg_match( '/^[a-f0-9]{8}$/D', $node['id'] ?? '' ) || isset( $ids[ $node['id'] ] ) ) { return ecb_error( 'Invalid, duplicate or excessive element IDs.' ); }
        $ids[ $node['id'] ] = true;
        if ( ! is_array( $node['settings'] ?? null ) ) { return ecb_error( 'Invalid element settings.' ); }
        if ( 'container' === ( $node['elType'] ?? '' ) ) {
            $element = \Elementor\Plugin::$instance->elements_manager->create_element_instance( $node );
        } elseif ( 'widget' === ( $node['elType'] ?? '' ) && in_array( $node['widgetType'] ?? '', $allowed, true ) ) {
            if ( 'form' === $node['widgetType'] && 'free' === $edition ) { return ecb_error( 'A Free export cannot contain a Pro Form widget.' ); }
            $element = \Elementor\Plugin::$instance->widgets_manager->get_widget_types( $node['widgetType'] );
        } else { return ecb_error( 'Unsupported element type.' ); }
        if ( ! $element ) { return ecb_error( 'Your installation does not provide the required native widget/container: ' . ( $node['widgetType'] ?? 'container' ) ); }
        // Elementor 4 separates style controls from the bulk control list on REST/frontend requests.
        // Named lookup includes that style stack; responsive variants may inherit their base control.
        $controls = $element->get_controls();
        foreach ( $node['settings'] as $key => $value ) {
            if ( ! isset( $controls[ $key ] ) ) {
                $control = $element->get_controls( $key );
                if ( ! $control && preg_match( '/^(.*)_(tablet|mobile)$/D', $key, $match ) ) {
                    $base = $element->get_controls( $match[1] );
                    if ( ! empty( $base['is_responsive'] ) || ! empty( $base['responsive'] ) ) { $control = $base; }
                }
                if ( $control ) { $controls[ $key ] = $control; }
            }
            if ( ! isset( $controls[ $key ] ) ) { return ecb_error( 'The installed Elementor version does not provide control ' . $key . ' on ' . ( $node['widgetType'] ?? 'container' ) . '. Update Elementor or use a compatible export.' ); }
            if ( 'form_fields' === $key ) {
                if ( ! is_array( $value ) || count( $value ) > 100 ) { return ecb_error( 'Invalid form fields.' ); }
                $field_controls = $controls[ $key ]['fields'] ?? array();
                foreach ( $value as $field ) {
                    foreach ( $field as $field_key => $field_value ) { if ( '_id' !== $field_key && ! isset( $field_controls[ $field_key ] ) ) { return ecb_error( 'Unsupported native form field control: ' . $field_key ); } }
                }
            }
        }
        $result = ecb_check_tree( $node['elements'] ?? array(), $edition, $ids, $count, $depth + 1 );
        if ( is_wp_error( $result ) ) { return $result; }
    }
    return true;
}
function ecb_write_asset( $file, $bytes ) {
    if ( file_exists( $file ) ) { return hash_equals( hash( 'sha256', $bytes ), hash_file( 'sha256', $file ) ); }
    if ( ! function_exists( 'wp_tempnam' ) ) { require_once ABSPATH . 'wp-admin/includes/file.php'; }
    $temp = wp_tempnam( basename( $file ), dirname( $file ) );
    if ( ! $temp ) { return false; }
    if ( strlen( $bytes ) !== file_put_contents( $temp, $bytes, LOCK_EX ) || ! rename( $temp, $file ) ) { if ( file_exists( $temp ) ) { wp_delete_file( $temp ); } return false; }
    return true;
}
function ecb_import_bundle( $request ) {
    if ( ! ecb_ready() ) { return ecb_error( 'Activate Elementor first.' ); }
    $data = $request->get_json_params(); $bundle = $data['ecb'] ?? array();
    if ( ( $bundle['format'] ?? '' ) !== 'elementor-converter-bundle' || ( $bundle['version'] ?? 0 ) !== 1 || ( $data['type'] ?? '' ) !== 'page' || ( $data['version'] ?? '' ) !== '0.4' ) { return ecb_error( 'Choose an Elementor Converter JSON export.' ); }
    $edition = $bundle['edition'] ?? '';
    if ( ! in_array( $edition, array( 'free', 'pro' ), true ) ) { return ecb_error( 'Unknown export edition.' ); }
    if ( 'pro' === $edition && ! defined( 'ELEMENTOR_PRO_VERSION' ) ) { return ecb_error( 'This is a Pro export. Activate Elementor Pro, or reconvert using Free mode.' ); }
    if ( ! empty( $bundle['unresolvedDependencies'] ) ) { return ecb_error( 'Supply the missing CSS/JS dependencies before import.' ); }
    $id = $bundle['assetId'] ?? '';
    if ( ! is_string( $id ) || ! preg_match( '/^ecb-[a-f0-9]{16}$/D', $id ) ) { return ecb_error( 'Invalid conversion ID.' ); }
    foreach ( array( 'css', 'js' ) as $key ) { if ( ! isset( $bundle[ $key ] ) || ! is_string( $bundle[ $key ] ) || strlen( $bundle[ $key ] ) > 4 * MB_IN_BYTES ) { return ecb_error( 'Invalid or oversized design asset.' ); } }
    $classes = preg_split( '/\s+/', $data['content'][0]['settings']['css_classes'] ?? '' );
    if ( count( $data['content'] ?? array() ) !== 1 || ! in_array( $id, $classes, true ) ) { return ecb_error( 'Missing design scope.' ); }
    $ids = array(); $count = 0; $checked = ecb_check_tree( $data['content'] ?? null, $edition, $ids, $count );
    if ( is_wp_error( $checked ) ) { return $checked; }
    // Breakpoint mappings must agree with this site; arbitrary source queries
    // remain external and therefore do not require changing site-wide settings.
    $breakpoints = \Elementor\Plugin::$instance->breakpoints->get_breakpoints();
    foreach ( array( 'mobile' => 767, 'tablet' => 1024 ) as $name => $value ) {
        $json = wp_json_encode( $data['content'] );
        if ( strpos( $json, '_' . $name . '"' ) !== false && isset( $breakpoints[ $name ] ) && (int) $breakpoints[ $name ]->get_value() !== $value ) { return ecb_error( 'This export uses the standard ' . $name . ' breakpoint (' . $value . 'px), but your site uses another value. Keep those source media queries in external CSS or align the export and site settings.' ); }
    }
    $uploads = wp_upload_dir(); if ( $uploads['error'] ) { return ecb_error( $uploads['error'], 500 ); }
    $dir = trailingslashit( $uploads['basedir'] ) . 'elementor-converter';
    if ( ! wp_mkdir_p( $dir ) ) { return ecb_error( 'Could not create the asset directory.', 500 ); }
    $hash = hash( 'sha256', $bundle['css'] . "\0" . $bundle['js'] );
    if ( ! ecb_write_asset( $dir . '/' . $id . '.css', $bundle['css'] ) || ( trim( $bundle['js'] ) && ! ecb_write_asset( $dir . '/' . $id . '.js', $bundle['js'] ) ) ) { return ecb_error( 'Could not save assets, or this ID conflicts with another revision. Regenerate the export.', 500 ); }
    $document = \Elementor\Plugin::$instance->documents->create( 'page', array( 'post_title' => sanitize_text_field( $data['title'] ?? 'Converted Page' ), 'post_status' => 'draft' ) );
    if ( is_wp_error( $document ) ) { return $document; }
    if ( ! $document ) { return ecb_error( 'Could not create the Elementor template.', 500 ); }
    $post_id = $document->get_main_id();
    try {
        if ( ! $document->save( array( 'elements' => $data['content'], 'settings' => array( 'template' => 'elementor_canvas', 'hide_title' => 'yes' ) ) ) ) { throw new \RuntimeException( 'Elementor rejected the template save.' ); }
        $saved = json_decode( get_post_meta( $post_id, '_elementor_data', true ), true );
        $saved_ids = array(); $saved_count = 0;
        $result = ecb_check_tree( $saved, $edition, $saved_ids, $saved_count );
        if ( is_wp_error( $result ) || $saved_count !== $count ) { throw new \RuntimeException( 'Elementor did not retain every generated element.' ); }
        // Compare authored content-bearing settings, including repeater fields.
        if ( ecb_content_values( $saved ) !== ecb_content_values( $data['content'] ) ) { throw new \RuntimeException( 'Elementor changed source content while saving. The draft was moved to trash.' ); }
    } catch ( \Throwable $error ) { wp_trash_post( $post_id ); return ecb_error( $error->getMessage(), 500 ); }
    $registry = get_option( 'ecb_asset_registry', array() );
    $registry[ $id ] = array( 'hash' => $hash, 'has_js' => (bool) trim( $bundle['js'] ), 'images' => $bundle['imageAttributes'] ?? array(), 'root_attributes' => $bundle['rootAttributes'] ?? array(), 'builtin_assets' => array_values( array_intersect( (array) ( $bundle['builtinAssets'] ?? array() ), array( 'lucide' ) ) ) );
    update_option( 'ecb_asset_registry', $registry, false ); update_post_meta( $post_id, '_ecb_asset_id', $id );
    return rest_ensure_response( array( 'templateId' => $post_id, 'title' => get_the_title( $post_id ), 'editUrl' => admin_url( 'post.php?post=' . $post_id . '&action=elementor' ), 'elements' => $count, 'warnings' => $bundle['warnings'] ?? array() ) );
}
function ecb_content_values( $nodes ) {
    $out = array();
    foreach ( $nodes as $node ) {
        $settings = array();
        foreach ( array( 'title', 'editor', 'html', 'text', 'image', 'link', 'selected_icon', 'form_fields', 'button_text', 'submit_actions', '_css_classes', 'css_classes' ) as $key ) {
            if ( isset( $node['settings'][ $key ] ) ) { $settings[ $key ] = $node['settings'][ $key ]; }
        }
        $out[] = array( 'type' => $node['widgetType'] ?? 'container', 'settings' => $settings, 'elements' => ecb_content_values( $node['elements'] ?? array() ) );
    }
    return $out;
}
function ecb_enqueue_id( $id, $frontend = true ) {
    $registry = get_option( 'ecb_asset_registry', array() ); if ( ! isset( $registry[ $id ] ) ) { return; }
    $uploads = wp_upload_dir(); $base = trailingslashit( $uploads['baseurl'] ) . 'elementor-converter/' . $id;
    wp_enqueue_style( $id, $base . '.css', array(), $registry[ $id ]['hash'] );
    if ( $frontend && $registry[ $id ]['has_js'] ) {
        $dependencies = array( 'elementor-frontend' );
        if ( in_array( 'lucide', $registry[ $id ]['builtin_assets'] ?? array(), true ) ) { wp_enqueue_script( 'ecb-lucide', plugins_url( 'assets/lucide.js', __FILE__ ), array(), '1.43.0', true ); $dependencies[] = 'ecb-lucide'; }
        wp_enqueue_script( $id, $base . '.js', $dependencies, $registry[ $id ]['hash'], true );
    }
}
function ecb_ids_in_tree( $nodes, &$ids ) {
    $registry = get_option( 'ecb_asset_registry', array() );
    foreach ( (array) $nodes as $node ) {
        foreach ( preg_split( '/\s+/', $node['settings']['css_classes'] ?? $node['settings']['_css_classes'] ?? '' ) as $id ) { if ( isset( $registry[ $id ] ) ) { $ids[ $id ] = true; } }
        ecb_ids_in_tree( $node['elements'] ?? array(), $ids );
    }
}
add_action( 'wp_enqueue_scripts', function () {
    if ( ! ecb_ready() ) { return; }
    $ids = array(); global $wp_query;
    foreach ( (array) ( $wp_query->posts ?? array() ) as $post ) { if ( $post instanceof WP_Post ) { ecb_ids_in_tree( json_decode( get_post_meta( $post->ID, '_elementor_data', true ), true ) ?: array(), $ids ); } }
    foreach ( array_keys( $ids ) as $id ) { ecb_enqueue_id( $id, ! \Elementor\Plugin::$instance->preview->is_preview_mode() ); }
}, 30 );
add_action( 'elementor/preview/enqueue_styles', function () { foreach ( array_keys( get_option( 'ecb_asset_registry', array() ) ) as $id ) { ecb_enqueue_id( $id, false ); } } );
add_action( 'elementor/frontend/before_render', function ( $element ) {
    $registry = get_option( 'ecb_asset_registry', array() );
    foreach ( preg_split( '/\s+/', $element->get_settings( 'css_classes' ) ?: ( $element->get_settings( '_css_classes' ) ?? '' ) ) as $id ) {
        if ( ! isset( $registry[ $id ] ) ) { continue; }
        ecb_enqueue_id( $id, ! \Elementor\Plugin::$instance->preview->is_preview_mode() );
        foreach ( (array) ( $registry[ $id ]['root_attributes'] ?? array() ) as $attr => $value ) { if ( is_scalar( $value ) && ( in_array( $attr, array( 'lang', 'dir' ), true ) || preg_match( '/^(data|aria)-[a-z0-9_.:-]+$/D', $attr ) ) ) { $element->add_render_attribute( '_wrapper', $attr, sanitize_text_field( (string) $value ) ); } }
        if ( did_action( 'wp_head' ) && ! wp_style_is( $id, 'done' ) ) { wp_print_styles( array( $id ) ); }
    }
} );
add_filter( 'elementor/widget/render_content', function ( $html, $widget ) {
    if ( 'image' !== $widget->get_name() || ! class_exists( 'WP_HTML_Tag_Processor' ) ) { return $html; }
    $image = $widget->get_settings( 'image' );
    if ( ! empty( $image['id'] ) ) { return $html; }
    $classes = preg_split( '/\s+/', $widget->get_settings( '_css_classes' ) ?? '' );
    foreach ( get_option( 'ecb_asset_registry', array() ) as $asset ) {
        foreach ( $classes as $class ) {
            $original = $asset['images'][ $class ] ?? null;
            if ( ! $original || ( $image['url'] ?? '' ) !== $original['url'] ) { continue; }
            $tags = new WP_HTML_Tag_Processor( $html );
            if ( $tags->next_tag( 'img' ) ) { $tags->set_attribute( 'alt', $original['alt'] ); return $tags->get_updated_html(); }
        }
    }
    return $html;
}, 10, 2 );
