<?php
/**
 * Plugin Name: Converter Studio Bridge
 * Description: Authenticated Gutenberg and Elementor deployment, reusable site parts and dynamic WordPress menus.
 * Version: 1.6.0
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: converter-studio-bridge
 */
if (!defined('ABSPATH')) { exit; }
register_activation_hook(__FILE__,function(){if(is_plugin_active('wordpress-converter-bridge/wordpress-converter-bridge.php'))wp_die(esc_html__('Deactivate the old WordPress Converter Bridge first. Imported pages are retained.','converter-studio-bridge'));});
if(defined('WCS_DIR'))return;
define('WCS_DIR', plugin_dir_path(__FILE__));
// Load after ordinary plugins so an existing converter runtime is never redeclared.
add_action('plugins_loaded', function () {
    if (!function_exists('gcb_register_blocks')) require_once WCS_DIR . 'runtimes/gutenberg-converter-runtime/gutenberg-converter-runtime.php';
    if (!function_exists('ecb_ready')) require_once WCS_DIR . 'runtimes/elementor-converter-runtime/elementor-converter-runtime.php';
}, 30);
require_once WCS_DIR . 'includes/assets.php';
require_once WCS_DIR . 'includes/media-jobs.php';
require_once WCS_DIR . 'includes/links.php';
require_once WCS_DIR . 'includes/menus.php';
require_once WCS_DIR . 'includes/deployment.php';
require_once WCS_DIR . 'includes/rendering.php';
function wcs_permission() { return current_user_can('manage_options') && current_user_can('unfiltered_html'); }
function wcs_error($message, $status = 400, $extra = array()) { return new WP_Error('wcs_error', $message, array_merge(array('status' => $status), $extra)); }
function wcs_site_option($key, $editor) { return 'wcs_site_' . substr(hash('sha256', $key . ':' . $editor), 0, 24); }
add_action('init', function () {
    register_post_type('wcs_part', array('labels' => array('name' => 'Converter Site Parts', 'singular_name' => 'Converter Site Part'), 'public' => false, 'show_ui' => true, 'show_in_rest' => true, 'supports' => array('title','editor','revisions','custom-fields'), 'capability_type' => 'page', 'map_meta_cap' => true));
    add_post_type_support('wcs_part','elementor');
});
add_filter('option_elementor_cpt_support', function ($types) { return array_values(array_unique(array_merge((array)$types, array('page','wcs_part')))); });
add_action('rest_api_init', function () {
    foreach (array('status' => array('GET','wcs_status'), 'pages' => array('GET','wcs_pages'), 'deploy' => array('POST','wcs_deploy'), 'media' => array('POST','wcs_media_endpoint'), 'identity' => array('POST','wcs_identity_endpoint'), 'homepage' => array('POST','wcs_homepage_endpoint')) as $path => $handler) {
        register_rest_route('wcs/v1', '/' . $path, array('methods'=>$handler[0], 'callback'=>$handler[1], 'permission_callback'=>'wcs_permission'));
    }
});
function wcs_status() {
    return rest_ensure_response(array('version'=>'1.6.0','name'=>get_bloginfo('name'),'url'=>home_url('/'),'elementor'=>ecb_ready(),'pro'=>defined('ELEMENTOR_PRO_VERSION'),'dom'=>class_exists('DOMDocument')));
}
function wcs_pages($request) {
    $editor = $request->get_param('editor');
    $posts = get_posts(array('post_type'=>'page','post_status'=>array('publish','draft','private','pending','future'),'posts_per_page'=>100,'s'=>sanitize_text_field($request->get_param('search') ?: ''),'orderby'=>'modified','order'=>'DESC'));
    $out = array();
    foreach ($posts as $post) {
        if (!current_user_can('edit_post',$post->ID)) continue;
        $type = get_post_meta($post->ID,'_elementor_edit_mode',true) === 'builder' ? 'elementor' : 'gutenberg';
        if ($editor && $type !== $editor) continue;
        $out[] = array('id'=>$post->ID,'title'=>$post->post_title,'status'=>$post->post_status,'editor'=>$type,'modified'=>$post->post_modified_gmt,'sourcePath'=>get_post_meta($post->ID,'_wcs_source_path',true),'siteKey'=>(get_option(get_post_meta($post->ID,'_wcs_site_option',true),array())['key'] ?? ''),'slug'=>$post->post_name);
    }
    $key=$request->get_param('siteKey');$mapping=array();if(is_string($key) && preg_match('/^[a-z0-9][a-z0-9-]{0,47}$/D',$key) && in_array($editor,array('gutenberg','elementor'),true)){$site=get_option(wcs_site_option($key,$editor),array());foreach($site['paths'] ?? array() as $path=>$id){if(get_post_type($id)==='page' && get_post_status($id)!=='trash' && current_user_can('edit_post',$id))$mapping[$path]=$id;}}
    return rest_ensure_response(array('pages'=>$out,'limit'=>100,'mappings'=>$mapping));
}

// Use the native WordPress Site Icon option so themes and the admin share it.
function wcs_identity_endpoint($request) {
    $data=$request->get_json_params();$url=$data['faviconUrl'] ?? '';
    if(!is_string($url) || !$url)return wcs_error('Select an uploaded favicon image.');
    $id=attachment_url_to_postid($url);
    if(!$id || !current_user_can('edit_post',$id))return wcs_error('Choose an image from this WordPress media library.',403);
    $mime=get_post_mime_type($id);$meta=wp_get_attachment_metadata($id);
    if(!in_array($mime,array('image/png','image/jpeg','image/webp'),true) || empty($meta['width']) || $meta['width']!==$meta['height'] || $meta['width']<512)return wcs_error('Use a square PNG, JPEG or WebP at least 512 × 512 pixels.');
    update_option('site_icon',$id);
    return rest_ensure_response(array('siteIconId'=>$id,'url'=>get_site_icon_url(512)));
}

function wcs_homepage_endpoint($request) {
    $id=$request->get_json_params()['pageId'] ?? 0;
    if(!is_int($id) || $id<1 || get_post_type($id)!=='page' || !current_user_can('edit_post',$id))return wcs_error('Choose an editable WordPress page.',400);
    if(get_post_status($id)!=='publish')return wcs_error('Publish this page before setting it as the homepage.',400);
    if((int)get_option('page_for_posts')===$id)return wcs_error('This page is assigned as the posts page. Choose another page or change Reading settings first.',409);
    update_option('page_on_front',$id);update_option('show_on_front','page');
    return rest_ensure_response(array('pageId'=>$id,'url'=>home_url('/'),'message'=>'WordPress homepage updated.'));
}
