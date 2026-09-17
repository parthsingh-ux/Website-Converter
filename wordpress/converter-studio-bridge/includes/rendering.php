<?php
if (!defined('ABSPATH')) exit;
add_filter('theme_page_templates',function($templates){$templates['wcs-full-width']='Converter — shared header and footer';return $templates;});
add_filter('template_include',function($template){if(is_singular('page') && get_post_meta(get_queried_object_id(),'_wcs_managed',true)==='1' && get_page_template_slug(get_queried_object_id())==='wcs-full-width')return WCS_DIR.'templates/full-width.php';return $template;},99);
function wcs_render_post($id,$site) {
    if(!$id || !get_post($id))return '';
    if(get_post_meta($id,'_wcs_editor',true)==='elementor'){
        if(!ecb_ready())return '<p>Activate Elementor to display this converted content.</p>';
        $html=\Elementor\Plugin::$instance->frontend->get_builder_content_for_display($id,true);
    }else{$html=do_blocks(get_post_field('post_content',$id));}
    return wcs_internal_links(wcs_dynamic_menus($html,$site),$site,get_post_meta($id,'_wcs_source_path',true));
}
add_action('wp_enqueue_scripts',function(){
    $id=get_queried_object_id();if(get_post_meta($id,'_wcs_managed',true)!=='1')return;
    $site=get_option(get_post_meta($id,'_wcs_site_option',true),array());
    foreach(array($site['header'] ?? 0,$id,$site['footer'] ?? 0) as $postId){
        if(!$postId)continue;
        if(get_post_meta($postId,'_wcs_editor',true)==='elementor' && ecb_ready()){
            ecb_enqueue_id(get_post_meta($postId,'_ecb_asset_id',true));
            if(class_exists('\\Elementor\\Core\\Files\\CSS\\Post')){ $css=new \Elementor\Core\Files\CSS\Post($postId);$css->enqueue(); }
        }else gcb_enqueue_id(get_post_meta($postId,'_gcb_asset_id',true));
    }
    wp_enqueue_script('wcs-header-scroll',plugins_url('assets/header-scroll.js',WCS_DIR.'converter-studio-bridge.php'),array(),'1.6.0',true);
    wp_enqueue_style('wcs-page',plugins_url('assets/page.css',WCS_DIR.'converter-studio-bridge.php'),array(),'1.6.0');
},40);

add_action('template_redirect', function () {
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    $path = trim(wp_parse_url($requestUri, PHP_URL_PATH) ?? '', '/');
    
    $homePath = trim(wp_parse_url(home_url(), PHP_URL_PATH) ?? '', '/');
    if ($homePath && strpos($path, $homePath) === 0) {
        $path = trim(substr($path, strlen($homePath)), '/');
    }

    if (!$path) return;

    $parts = explode('/', $path);
    $siteId = $parts[0];
    
    $site = null;
    foreach (array('gutenberg', 'elementor') as $editor) {
        $option = get_option(wcs_site_option($siteId, $editor));
        if (!empty($option['key'])) {
            $site = $option;
            break;
        }
    }
    
    if (!$site) return;

    $subPath = implode('/', array_slice($parts, 1));
    $subPath = wcs_link_path($subPath);

    $paths = $site['paths'] ?? array();
    $pageId = $paths[$subPath] ?? 0;
    if (!$pageId) {
        $keys = $subPath === '' ? array('index.html', 'index.htm', 'index') : array($subPath . '/index.html', $subPath . '/index.htm', $subPath . '.html', $subPath . '.htm');
        foreach ($keys as $key) {
            if (isset($paths[$key])) {
                $pageId = (int)$paths[$key];
                break;
            }
        }
    }

    if ($pageId && get_post_type($pageId) === 'page' && get_post_status($pageId) === 'publish') {
        global $wp_query;
        $wp_query->query_vars['page_id'] = $pageId;
        $wp_query->is_single = false;
        $wp_query->is_page = true;
        $wp_query->is_singular = true;
        $wp_query->is_404 = false;
        $wp_query->queried_object = get_post($pageId);
        $wp_query->queried_object_id = $pageId;
        status_header(200);
    }
}, 5);

add_filter('the_content',function($html){$id=get_the_ID();if(!$id || get_post_meta($id,'_wcs_managed',true)!=='1')return $html;$option=get_post_meta($id,'_wcs_links_option',true) ?: get_post_meta($id,'_wcs_site_option',true);return wcs_internal_links($html,get_option($option,array()),get_post_meta($id,'_wcs_source_path',true));},99);

