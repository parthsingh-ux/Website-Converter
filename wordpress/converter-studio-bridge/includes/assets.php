<?php
if (!defined('ABSPATH')) exit;
function wcs_validate_part($part, $editor) {
    if (!is_array($part)) return wcs_error('Invalid page or shared part.');
    $css = $editor === 'elementor' ? ($part['ecb']['css'] ?? null) : ($part['patternCss'] ?? null);
    $js = $editor === 'elementor' ? ($part['ecb']['js'] ?? null) : ($part['patternJs'] ?? null);
    if (!is_string($css) || !is_string($js) || strlen($css)>4*MB_IN_BYTES || strlen($js)>4*MB_IN_BYTES) return wcs_error('Missing or oversized CSS/JavaScript.');
    if ($editor === 'elementor') {
        if (!ecb_ready()) return wcs_error('Activate Elementor before deploying an Elementor page.');
        $meta = $part['ecb'] ?? array();
        if (($meta['format'] ?? '') !== 'elementor-converter-bundle' || ($meta['version'] ?? 0) !== 1 || ($part['version'] ?? '') !== '0.4') return wcs_error('Unsupported Elementor bundle.');
        if (!in_array($meta['edition'] ?? '',array('free','pro'),true)) return wcs_error('Invalid Elementor edition.');
        if ($meta['edition'] === 'pro' && !defined('ELEMENTOR_PRO_VERSION')) return wcs_error('Activate Elementor Pro or choose Free conversion.');
        if (!preg_match('/^ecb-[a-f0-9]{16}$/D',$meta['assetId'] ?? '') || !empty($meta['unresolvedDependencies'])) return wcs_error('Missing source CSS/JS dependencies or invalid Elementor asset ID.');
        if (!is_array($part['content'] ?? null) || count($part['content'])!==1 || !in_array($meta['assetId'],preg_split('/\s+/', $part['content'][0]['settings']['css_classes'] ?? ''),true)) return wcs_error('Missing Elementor scope root.');
        $ids=array();$count=0;$valid=wcs_check_elementor_tree($part['content'],$meta['edition'],$ids,$count);
        if(is_wp_error($valid))return $valid;
        $breakpoints=\Elementor\Plugin::$instance->breakpoints->get_active_breakpoints();
        $json=wp_json_encode($part['content']);
        foreach(array('mobile'=>767,'tablet'=>1024) as $name=>$value) {
            if(strpos($json,'_'.$name.'"')!==false && isset($breakpoints[$name]) && (int)$breakpoints[$name]->get_value()!==$value) return wcs_error('The site uses a different '.$name.' breakpoint. Align the source and Elementor breakpoints.');
        }
    } else {
        if (($part['format'] ?? '')!=='gcb-bundle' || ($part['formatVersion'] ?? 0)!==1 || !is_string($part['content'] ?? null) || strlen($part['content'])>8*MB_IN_BYTES) return wcs_error('Unsupported Gutenberg bundle.');
        $id=$part['patternScopeId'] ?? '';
        if(!preg_match('/^gcb-[a-f0-9]{16}$/D',$id) || !empty($part['manifest']['unresolvedDependencies']))return wcs_error('Missing source CSS/JS dependencies or invalid Gutenberg asset ID.');
        $blocks=parse_blocks($part['content']);
        if(!gcb_check_blocks($blocks) || count($blocks)!==1 || !in_array($id,preg_split('/\s+/',$blocks[0]['attrs']['className'] ?? ''),true))return wcs_error('Invalid Gutenberg blocks or missing scope root.');
    }
    return true;
}
function wcs_write_asset($file, $bytes) {
    if (file_exists($file) && hash_equals(hash('sha256', $bytes), hash_file('sha256', $file))) {
        return true;
    }
    $written = @file_put_contents($file, $bytes, LOCK_EX);
    if ($written === strlen($bytes)) {
        return true;
    }
    $written = @file_put_contents($file, $bytes);
    if ($written === strlen($bytes)) {
        return true;
    }
    if (!function_exists('wp_tempnam')) {
        require_once ABSPATH . 'wp-admin/includes/file.php';
    }
    $temp = @wp_tempnam(basename($file), dirname($file));
    if ($temp) {
        @file_put_contents($temp, $bytes);
        if (@rename($temp, $file)) {
            return true;
        }
        if (file_exists($temp)) { @wp_delete_file($temp); }
    }
    return false;
}
function wcs_register_assets($part, $editor) {
    $elementor=$editor==='elementor';$meta=$part['ecb'] ?? array();
    $id=$elementor?$meta['assetId']:$part['patternScopeId'];$css=$elementor?$meta['css']:$part['patternCss'];$js=$elementor?$meta['js']:$part['patternJs'];
    $uploads=wp_upload_dir();if(!empty($uploads['error']))throw new RuntimeException('WordPress uploads directory is unavailable: '.$uploads['error']);
    $dir=trailingslashit($uploads['basedir']).($elementor?'elementor-converter':'gutenberg-converter');
    if(!wp_mkdir_p($dir))throw new RuntimeException('Cannot create directory: '.$dir.'. Check permissions on wp-content/uploads.');
    if(!wcs_write_asset($dir.'/'.$id.'.css',$css)){
        $err=error_get_last();$detail=$err?' ('.$err['message'].')':'';
        throw new RuntimeException('Cannot write CSS asset file at '.$dir.'/'.$id.'.css'.$detail.'. Check file permissions or regenerate export.');
    }
    if(trim($js) && !wcs_write_asset($dir.'/'.$id.'.js',$js)){
        $err=error_get_last();$detail=$err?' ('.$err['message'].')':'';
        throw new RuntimeException('Cannot write JS asset file at '.$dir.'/'.$id.'.js'.$detail.'. Check file permissions or regenerate export.');
    }
    $option=$elementor?'ecb_asset_registry':'gcb_asset_registry';$registry=get_option($option,array());$hash=hash('sha256',$css."\0".$js);
    $registry[$id]=$elementor?array('hash'=>$hash,'has_js'=>(bool)trim($js),'images'=>$meta['imageAttributes'] ?? array(),'root_attributes'=>$meta['rootAttributes'] ?? array(),'builtin_assets'=>array_intersect((array)($meta['builtinAssets'] ?? array()),array('lucide'))):array('asset_hash'=>$hash,'has_js'=>(bool)trim($js),'title'=>$part['title'] ?? 'Converted page');
    update_option($option,$registry,false);
    return $id;
}
function wcs_upload_images($images) {
    if(!is_array($images) || count($images)>100)throw new RuntimeException('Attach at most 100 images.');
    require_once ABSPATH.'wp-admin/includes/file.php';require_once ABSPATH.'wp-admin/includes/media.php';require_once ABSPATH.'wp-admin/includes/image.php';
    $map=array();$bytes=0;
    foreach($images as $image) {
        $name=$image['filename'] ?? '';$data=$image['data'] ?? '';
        if(!is_string($name) || strpos($name,'..')!==false || !is_string($data) || !preg_match('~^data:image/(?:png|jpeg|webp|gif|avif|svg\+xml|x-icon|vnd.microsoft.icon|bmp);base64,(.*)$~sD',$data,$match))throw new RuntimeException('Invalid image upload.');
        $raw=base64_decode($match[1],true);$bytes+=strlen($raw ?: '');
        if($raw===false || strlen($raw)>32*MB_IN_BYTES || $bytes>32*MB_IN_BYTES)throw new RuntimeException('Images exceed the upload size limit.');
        $hash=hash('sha256',$raw);$old=get_posts(array('post_type'=>'attachment','post_status'=>'inherit','posts_per_page'=>1,'meta_key'=>'_wcs_image_hash','meta_value'=>$hash));
        if($old && is_file(get_attached_file($old[0]->ID))) {$map[$name]=wp_get_attachment_url($old[0]->ID);wcs_remember_media_path($name,$old[0]->ID);continue;}
        $filename=sanitize_file_name(basename($name));
        // SVG uploads are allowed only for the already-required unfiltered-HTML administrator.
        if(strtolower(pathinfo($filename,PATHINFO_EXTENSION))==='svg') {
            if(!class_exists('DOMDocument'))throw new RuntimeException('The PHP DOM extension is required for SVG uploads.');
            if(preg_match('/<!DOCTYPE|<!ENTITY|<script\b|\son\w+\s*=|(?:javascript|data):|<foreignObject\b/i',$raw))throw new RuntimeException('SVG contains active content. Upload a static SVG.');
            $xml=new DOMDocument();$previous=libxml_use_internal_errors(true);$ok=$xml->loadXML($raw,LIBXML_NONET);libxml_clear_errors();libxml_use_internal_errors($previous);
            if(!$ok || $xml->documentElement->localName!=='svg')throw new RuntimeException('Invalid SVG image.');
            $upload=wp_upload_bits($filename,null,$raw);
            if($upload['error'])throw new RuntimeException('Could not store SVG image.');
            $id=wp_insert_attachment(array('post_title'=>pathinfo($filename,PATHINFO_FILENAME),'post_mime_type'=>'image/svg+xml','post_status'=>'inherit','meta_input'=>array('_wcs_image_hash'=>$hash)),$upload['file'],0,true);
        } else {
            $temp=wp_tempnam($filename);if(!$temp || file_put_contents($temp,$raw)!==strlen($raw))throw new RuntimeException('Could not write image upload.');
            // Store the original without expensive synchronous thumbnail generation.
            $info=@getimagesize($temp);
            $checked=wp_check_filetype_and_ext($temp,$filename);
            if(!$info || empty($checked['type']) || strpos($checked['type'],'image/')!==0){wp_delete_file($temp);throw new RuntimeException('Invalid raster image.');}
            $sideload=array('name'=>$filename,'tmp_name'=>$temp,'error'=>0,'size'=>strlen($raw));
            $upload=wp_handle_sideload($sideload,array('test_form'=>false));
            if(isset($upload['error']))throw new RuntimeException(esc_html($upload['error']));
            $id=wp_insert_attachment(array('post_title'=>pathinfo($filename,PATHINFO_FILENAME),'post_mime_type'=>$upload['type'],'post_status'=>'inherit','meta_input'=>array('_wcs_image_hash'=>$hash)),$upload['file'],0,true);
            if(!is_wp_error($id))wp_update_attachment_metadata($id,array('width'=>$info[0],'height'=>$info[1],'file'=>_wp_relative_upload_path($upload['file']),'filesize'=>strlen($raw),'sizes'=>array()));
            if(file_exists($temp))wp_delete_file($temp);
        }
        if(is_wp_error($id))throw new RuntimeException(esc_html('WordPress rejected image '.$filename.': '.$id->get_error_message()));
        update_post_meta($id,'_wcs_image_hash',$hash);$map[$name]=wp_get_attachment_url($id);wcs_remember_media_path($name,$id);
    }
    return $map;
}
function wcs_media_endpoint($request) {
    try { return rest_ensure_response(wcs_media_job($request->get_json_params())); }
    catch(Throwable $e){return wcs_error($e->getMessage());}
}
// Replace only URL-shaped references, including JSON-escaped HTML attributes and CSS URLs.
function wcs_rewrite_media($value,$map) {
    if(is_array($value)){foreach($value as $key=>$item)$value[$key]=wcs_rewrite_media($item,$map);return $value;}
    if(!is_string($value))return $value;
    // Missing URLs constructed from upload filenames must also resolve aliases.
    $uploads=wp_upload_dir();
    $base=preg_quote(trailingslashit($uploads['baseurl']),'~');
    $value=preg_replace_callback('~'.$base.'(?:[0-9]{4}/[0-9]{2}/)?([^\s"\'<>?()]+)~',function($m)use($map,$uploads){
        $name=rawurldecode($m[1]);
        $relative=rawurldecode(substr($m[0],strlen(trailingslashit($uploads['baseurl']))));
        if(isset($map[$name]) && strpos($relative,'..')===false && !is_file(trailingslashit($uploads['basedir']).$relative))return $map[$name];
        return $m[0];
    },$value);
    // Flat file selection can satisfy nested source paths only when the basename is unambiguous.
    $basenames=array();
    foreach($map as $path=>$url){$name=basename($path);if(!array_key_exists($name,$basenames))$basenames[$name]=$url;elseif($basenames[$name]!==$url)$basenames[$name]=false;}
    $value=preg_replace_callback('~(^|["\'\s(=])((?!//)[a-zA-Z0-9_./%+\~-]+\.(?:png|jpe?g|gif|webp|avif|svg|ico|bmp))(?=$|["\'\s)?,\\\\])~i',function($m)use($map,$basenames){
        $path=rawurldecode($m[2]);$url=$map[ltrim(preg_replace('~^\./~','',$path),'/')] ?? ($basenames[basename($path)] ?? false);
        return $url?$m[1].$url:$m[0];
    },$value);
    foreach($map as $from=>$to) {
        if($value===$from || $value==='./'.$from)return $to;
        $encoded=implode('/',array_map('rawurlencode',explode('/',$from)));
        foreach(array_unique(array($from,'./'.$from,'/'.$from,$encoded,'./'.$encoded,'/'.$encoded)) as $url) {
            $quoted=preg_quote($url,'~');
            $value=preg_replace_callback('~(?<=["\'\s(=])'.$quoted.'(?=["\'\s)?,\\\\]|$)~',function()use($to){return $to;},$value);
        }
    }
    return $value;
}

function wcs_check_elementor_tree( $nodes, $edition, &$ids, &$count, $depth = 0 ) {
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
        $result = wcs_check_elementor_tree( $node['elements'] ?? array(), $edition, $ids, $count, $depth + 1 );
        if ( is_wp_error( $result ) ) { return $result; }
    }
    return true;
}

function wcs_remember_media_path($path,$id) {
    update_option('wcs_media_path_'.hash('sha256',$path),array('path'=>$path,'id'=>(int)$id),false);
}
function wcs_saved_media_urls() {
    global $wpdb;$map=array();
    $values=$wpdb->get_col($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name LIKE %s",$wpdb->esc_like('wcs_media_path_').'%'));
    foreach($values as $value){$item=maybe_unserialize($value);if(!is_array($item))continue;$id=$item['id'];if(get_post_type($id)==='attachment' && get_post_status($id)!=='trash' && is_file(get_attached_file($id)))$map[$item['path']]=wp_get_attachment_url($id);}
    ksort($map);return $map;
}
