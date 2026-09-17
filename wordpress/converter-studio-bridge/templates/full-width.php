<?php
if(!defined('ABSPATH'))exit;
$pageId=get_queried_object_id();$site=get_option(get_post_meta($pageId,'_wcs_site_option',true),array());
?><!doctype html>
<html <?php language_attributes(); ?>>
<head><meta charset="<?php bloginfo('charset'); ?>"><meta name="viewport" content="width=device-width, initial-scale=1"><?php wp_head(); ?></head>
<body <?php body_class('wcs-page'); ?>>
<?php wp_body_open(); ?>
<div class="wcs-part wcs-header"><?php echo wcs_render_post($site['header'] ?? 0,$site); ?></div>
<div class="wcs-page-content"><?php
while(have_posts()) {
    the_post();
    // Elementor must see the main document through WordPress's content filter,
    // including its editable preview wrapper. Template embedding is only for shared parts.
    if(get_post_meta(get_the_ID(), '_wcs_editor', true)==='elementor') {
        the_content();
    } else {
        echo wcs_render_post(get_the_ID(),get_option(get_post_meta(get_the_ID(),'_wcs_links_option',true),$site));
    }
}
?></div>
<div class="wcs-part wcs-footer"><?php echo wcs_render_post($site['footer'] ?? 0,$site); ?></div>
<?php wp_footer(); ?>
</body></html>
