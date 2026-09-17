<?php
if (!defined('ABSPATH')) exit;

/**
 * Multi-Tenant Site Engine for Converter Studio Bridge
 * Handles site lifecycle, isolation, dynamic subdirectory routing, and plugin/theme ZIP installations.
 */

function wcs_get_all_sites() {
    global $wpdb;
    $sites = array();
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE %s",
        'wcs_site_%'
    ));

    foreach ($rows as $row) {
        $site = maybe_unserialize($row->option_value);
        if (!is_array($site) || empty($site['key'])) continue;
        
        $key = $site['key'];
        $editor = $site['editor'] ?? 'gutenberg';
        $paths = $site['paths'] ?? array();
        $pagesCount = 0;
        
        foreach ($paths as $path => $pageId) {
            if (get_post_type($pageId) === 'page' && get_post_status($pageId) !== 'trash') {
                $pagesCount++;
            }
        }

        $sites[] = array(
            'siteId' => $key,
            'title' => $site['title'] ?? ucfirst(str_replace('-', ' ', $key)),
            'editor' => $editor,
            'headerId' => $site['header'] ?? null,
            'footerId' => $site['footer'] ?? null,
            'pagesCount' => $pagesCount,
            'paths' => $paths,
            'url' => home_url('/' . $key . '/'),
            'optionKey' => $row->option_name,
        );
    }

    return $sites;
}

function wcs_sites_endpoint($request) {
    try {
        return rest_ensure_response(array(
            'sites' => wcs_get_all_sites(),
            'total' => count(wcs_get_all_sites())
        ));
    } catch (Throwable $e) {
        return wcs_error($e->getMessage(), 500);
    }
}

function wcs_create_site_endpoint($request) {
    try {
        $params = $request->get_json_params();
        $siteId = sanitize_title($params['siteId'] ?? '');
        $title = sanitize_text_field($params['title'] ?? '');
        $editor = $params['editor'] ?? 'gutenberg';

        if (!$siteId || !preg_match('/^[a-z0-9][a-z0-9-]{0,47}$/D', $siteId)) {
            return wcs_error('A valid siteId slug is required (alphanumeric and hyphens only).');
        }

        if (!in_array($editor, array('gutenberg', 'elementor'), true)) {
            return wcs_error('Invalid editor. Choose gutenberg or elementor.');
        }

        $optionName = wcs_site_option($siteId, $editor);
        $existing = get_option($optionName);

        if ($existing && !empty($existing['key'])) {
            return wcs_error('Site ID already exists. Use update or choose a new siteId.', 409);
        }

        $siteData = array(
            'key' => $siteId,
            'title' => $title ?: ucfirst(str_replace('-', ' ', $siteId)),
            'editor' => $editor,
            'paths' => array(),
            'menus' => array(),
            'header' => null,
            'footer' => null,
            'created' => time()
        );

        update_option($optionName, $siteData, false);

        return rest_ensure_response(array(
            'success' => true,
            'site' => array(
                'siteId' => $siteId,
                'title' => $siteData['title'],
                'editor' => $editor,
                'url' => home_url('/' . $siteId . '/')
            )
        ));
    } catch (Throwable $e) {
        return wcs_error($e->getMessage(), 500);
    }
}

function wcs_delete_site_endpoint($request) {
    try {
        $siteId = sanitize_title($request['siteId'] ?? $request->get_param('siteId') ?? '');
        if (!$siteId) return wcs_error('siteId is required.');

        global $wpdb;
        $deletedPages = 0;
        $deletedParts = 0;

        foreach (array('gutenberg', 'elementor') as $editor) {
            $optionName = wcs_site_option($siteId, $editor);
            $site = get_option($optionName);

            if ($site && is_array($site)) {
                // Delete associated pages
                if (!empty($site['paths'])) {
                    foreach ($site['paths'] as $path => $pageId) {
                        if ($pageId && get_post_type($pageId) === 'page') {
                            wp_delete_post($pageId, true);
                            $deletedPages++;
                        }
                    }
                }

                // Delete shared parts (header/footer)
                foreach (array('header', 'footer') as $kind) {
                    if (!empty($site[$kind]) && get_post_type($site[$kind]) === 'wcs_part') {
                        wp_delete_post($site[$kind], true);
                        $deletedParts++;
                    }
                }

                // Delete associated nav menus
                if (!empty($site['menus']) && is_array($site['menus'])) {
                    foreach ($site['menus'] as $menuId) {
                        wp_delete_nav_menu($menuId);
                    }
                }

                delete_option($optionName);
            }
        }

        // Clean up any remaining posts linked to this site option
        $linkedPages = get_posts(array(
            'post_type' => array('page', 'wcs_part'),
            'post_status' => 'any',
            'posts_per_page' => -1,
            'meta_key' => '_wcs_site_id',
            'meta_value' => $siteId
        ));

        foreach ($linkedPages as $post) {
            wp_delete_post($post->ID, true);
        }

        return rest_ensure_response(array(
            'deleted' => true,
            'siteId' => $siteId,
            'deletedPages' => $deletedPages,
            'deletedParts' => $deletedParts
        ));
    } catch (Throwable $e) {
        return wcs_error($e->getMessage(), 500);
    }
}

/**
 * Plugin & Theme Installation from ZIP packages
 */
function wcs_install_plugin_endpoint($request) {
    try {
        if (!current_user_can('install_plugins')) {
            return wcs_error('You do not have permission to install plugins on this site.', 403);
        }

        $params = $request->get_json_params();
        $zipData = $params['pluginZip'] ?? '';
        $activate = !empty($params['activate']);

        if (!$zipData || !preg_match('~^data:application/(?:zip|x-zip-compressed);base64,(.*)$~sD', $zipData, $match)) {
            return wcs_error('Provide base64 encoded pluginZip data.');
        }

        $raw = base64_decode($match[1], true);
        if ($raw === false || strlen($raw) > 50 * MB_IN_BYTES) {
            return wcs_error('Invalid or oversized plugin ZIP.');
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

        $temp = wp_tempnam('plugin.zip');
        if (!$temp || file_put_contents($temp, $raw) !== strlen($raw)) {
            return wcs_error('Could not write temporary plugin file.');
        }

        $skin = new Automatic_Upgrader_Skin();
        $upgrader = new Plugin_Upgrader($skin);
        $result = $upgrader->install($temp, array('overwrite_package' => true));
        if (file_exists($temp)) wp_delete_file($temp);

        if (is_wp_error($result)) return wcs_error($result->get_error_message());
        if (!$result) return wcs_error('Plugin installation failed.');

        $pluginFile = $upgrader->plugin_info();
        if ($activate && $pluginFile) {
            activate_plugin($pluginFile);
        }

        return rest_ensure_response(array(
            'success' => true,
            'pluginFile' => $pluginFile,
            'activated' => $activate && is_plugin_active($pluginFile)
        ));
    } catch (Throwable $e) {
        return wcs_error($e->getMessage(), 500);
    }
}

function wcs_install_theme_endpoint($request) {
    try {
        if (!current_user_can('install_themes')) {
            return wcs_error('You do not have permission to install themes on this site.', 403);
        }

        $params = $request->get_json_params();
        $zipData = $params['themeZip'] ?? '';
        $activate = !empty($params['activate']);

        if (!$zipData || !preg_match('~^data:application/(?:zip|x-zip-compressed);base64,(.*)$~sD', $zipData, $match)) {
            return wcs_error('Provide base64 encoded themeZip data.');
        }

        $raw = base64_decode($match[1], true);
        if ($raw === false || strlen($raw) > 50 * MB_IN_BYTES) {
            return wcs_error('Invalid or oversized theme ZIP.');
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/theme.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

        $temp = wp_tempnam('theme.zip');
        if (!$temp || file_put_contents($temp, $raw) !== strlen($raw)) {
            return wcs_error('Could not write temporary theme file.');
        }

        $skin = new Automatic_Upgrader_Skin();
        $upgrader = new Theme_Upgrader($skin);
        $result = $upgrader->install($temp, array('overwrite_package' => true));
        if (file_exists($temp)) wp_delete_file($temp);

        if (is_wp_error($result)) return wcs_error($result->get_error_message());
        if (!$result) return wcs_error('Theme installation failed.');

        $themeSlug = $upgrader->theme_info();
        if ($activate && $themeSlug) {
            switch_theme($themeSlug);
        }

        return rest_ensure_response(array(
            'success' => true,
            'themeSlug' => $themeSlug,
            'activated' => $activate && get_stylesheet() === $themeSlug
        ));
    } catch (Throwable $e) {
        return wcs_error($e->getMessage(), 500);
    }
}

function wcs_activate_endpoint($request) {
    try {
        $params = $request->get_json_params();
        $type = $params['type'] ?? '';
        $slug = $params['slug'] ?? '';

        if (!in_array($type, array('plugin', 'theme'), true) || !$slug) {
            return wcs_error('type (plugin or theme) and slug are required.');
        }

        if ($type === 'plugin') {
            if (!current_user_can('activate_plugins')) return wcs_error('Permission denied.', 403);
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
            $result = activate_plugin($slug);
            if (is_wp_error($result)) return wcs_error($result->get_error_message());
            return rest_ensure_response(array('success' => true, 'activatedPlugin' => $slug));
        } else {
            if (!current_user_can('switch_themes')) return wcs_error('Permission denied.', 403);
            switch_theme($slug);
            return rest_ensure_response(array('success' => true, 'activatedTheme' => get_stylesheet()));
        }
    } catch (Throwable $e) {
        return wcs_error($e->getMessage(), 500);
    }
}
