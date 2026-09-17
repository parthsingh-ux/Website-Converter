<?php
if (!defined('ABSPATH')) exit;
function wcs_snapshot($id) { return array('post'=>get_post($id,ARRAY_A),'meta'=>get_post_meta($id)); }
function wcs_restore($id,$snapshot) {
    wp_update_post(wp_slash($snapshot['post']));
    foreach(get_post_meta($id) as $key=>$values)delete_post_meta($id,$key);
    foreach($snapshot['meta'] as $key=>$values)foreach($values as $value)add_post_meta($id,$key,wp_slash(maybe_unserialize($value)));
    clean_post_cache($id);
}
function wcs_save_part($id,$part,$editor,$title,$postType='page') {
    $asset=wcs_register_assets($part,$editor);
    if(!$id){$id=wp_insert_post(wp_slash(array('post_type'=>$postType,'post_title'=>$title,'post_status'=>'draft')),true);if(is_wp_error($id))throw new RuntimeException(esc_html($id->get_error_message()));}
    if($editor==='elementor'){
        update_post_meta($id,'_elementor_edit_mode','builder');
        $document=\Elementor\Plugin::$instance->documents->get($id);
        if(!$document || !$document->save(array('elements'=>$part['content'],'settings'=>array('hide_title'=>'yes'))))throw new RuntimeException('Elementor rejected the document save.');
        $saved=json_decode(get_post_meta($id,'_elementor_data',true),true);
        if(!is_array($saved) || ecb_content_values($saved)!==ecb_content_values($part['content']))throw new RuntimeException('Elementor did not retain all source content.');
        update_post_meta($id,'_ecb_asset_id',$asset);
    }else{
        $saved=wp_update_post(wp_slash(array('ID'=>$id,'post_content'=>$part['content'],'post_title'=>$title)),true);if(is_wp_error($saved))throw new RuntimeException(esc_html($saved->get_error_message()));
        if(get_post_field('post_content',$id)!==$part['content'])throw new RuntimeException('WordPress changed the generated block content.');
        update_post_meta($id,'_gcb_asset_id',$asset);
    }
    update_post_meta($id,'_wcs_editor',$editor);return $id;
}
function wcs_deploy($request) {
    if(strlen($request->get_body())>30*MB_IN_BYTES)return wcs_error('Deployment exceeds 30 MB.',413);
    $data=$request->get_json_params();$bundle=$data['bundle'] ?? array();$editor=$bundle['editor'] ?? '';$key=$bundle['siteKey'] ?? '';
    if(($bundle['format'] ?? '')!=='wcs-site-bundle' || ($bundle['version'] ?? 0)!==1 || !in_array($editor,array('gutenberg','elementor'),true) || !preg_match('/^[a-z0-9][a-z0-9-]{0,47}$/D',$key))return wcs_error('Invalid site bundle.');
    $operation=$data['operationId'] ?? '';if(!is_string($operation) || !preg_match('/^[a-zA-Z0-9-]{16,80}$/D',$operation))return wcs_error('An operation ID is required for safe retries.');
    $slug=isset($data['slug'])?sanitize_title($data['slug']):null;
    $status=$data['status'] ?? 'draft';if(!in_array($status,array('draft','publish'),true))return wcs_error('Choose draft or published status.');
    $policy=$data['globalPolicy'] ?? 'keep';if(!in_array($policy,array('keep','replace'),true))return wcs_error('Invalid shared-part policy.');
    $rawPageId=$data['pageId'] ?? 0;if(!is_int($rawPageId) || $rawPageId<0)return wcs_error('pageId must be zero for create or a positive integer for update.');$pageId=$rawPageId;$title=sanitize_text_field($bundle['title'] ?? '');if(!$title)return wcs_error('A page title is required.');
    $option=wcs_site_option($key,$editor);$operationOption='wcs_op_'.hash('sha256',$operation);$hash=hash('sha256',wp_json_encode($data));
    $done=get_option($operationOption);if($done){if(!hash_equals($done['hash'],$hash))return wcs_error('This operation ID belongs to different input. Start a new conversion.',409);return rest_ensure_response($done['result']);}
    if($pageId){
        if(get_post_type($pageId)!=='page' || !current_user_can('edit_post',$pageId) || get_post_status($pageId)==='trash')return wcs_error('The selected page is unavailable or not editable.',403);
        $existingEditor=get_post_meta($pageId,'_elementor_edit_mode',true)==='builder'?'elementor':'gutenberg';if($existingEditor!==$editor)return wcs_error('The selected page uses the other editor. Choose a matching page or create a new one.',409);
    }
    if(!empty($bundle['menus']) && !class_exists('DOMDocument'))return wcs_error('Enable the PHP DOM extension to deploy dynamic navigation.');
    if(empty($bundle['parts']['page']))return wcs_error('Page content is missing.');
    foreach(array('page','header','footer') as $kind)if(!empty($bundle['parts'][$kind])){$valid=wcs_validate_part($bundle['parts'][$kind],$editor);if(is_wp_error($valid))return $valid;}
    $valid=wcs_validate_menus($bundle['menus'] ?? array());if(is_wp_error($valid))return $valid;
    // Option insertion is an atomic lock across concurrent workers. Stale locks (> 180s) from process crashes are automatically cleared.
    $lock='wcs_lock_'.substr(hash('sha256',home_url('/')),0,24);
    $existingLock=get_option($lock);
    if($existingLock!==false){
        $started=is_array($existingLock)?($existingLock['started'] ?? 0):0;
        if(time() - $started > 180){delete_option($lock);}
    }
    if(!add_option($lock,array('operation'=>$operation,'started'=>time()),'','no'))return wcs_error('Another deployment is running. Wait for it to finish. If the server stopped mid-deployment, see the recovery instructions.',409);
    $snapshot=$pageId?wcs_snapshot($pageId):null;$createdPosts=array();$createdMenus=array();$before=get_option($option,array());$site=$before;$createdPage=false;$committed=false;
    try{
        $map=$data['mediaUrls'] ?? array();
        if(!is_array($map))throw new RuntimeException('Invalid media URL map.');
        foreach($map as $path=>$url)if(!is_string($path) || !is_string($url) || !preg_match('~^https?://~i',$url))throw new RuntimeException('Invalid media URL.');
        $map=array_merge(wcs_saved_media_urls(),$map);
        if(!empty($bundle['imagesArray']))throw new RuntimeException('Upload images through the media queue before deploying pages. Update Studio and retry.');
        if($map){
            $bundle['parts']=wcs_rewrite_media($bundle['parts'],$map);
            foreach($bundle['parts'] as &$part){if(!$part)continue;$old=$editor==='elementor'?$part['ecb']['assetId']:$part['patternScopeId'];$new=($editor==='elementor'?'ecb-':'gcb-').substr(hash('sha256',$old.wp_json_encode($map)),0,16);$part=json_decode(str_replace($old,$new,wp_json_encode($part)),true);}unset($part);
        }
        $shared=!empty($bundle['sharedParts']);$updated=array();
        if($shared)foreach(array('header','footer') as $kind){
            if(empty($bundle['parts'][$kind]) || (!empty($site[$kind]) && $policy==='keep'))continue;
            $partId=wp_insert_post(array('post_type'=>'wcs_part','post_title'=>$key.' '.$kind,'post_status'=>'draft'),true);if(is_wp_error($partId))throw new RuntimeException($partId->get_error_message());$createdPosts[]=$partId;
            wcs_save_part($partId,$bundle['parts'][$kind],$editor,$key.' '.$kind,'wcs_part');
            update_post_meta($partId,'_wcs_source_path',$bundle['sourcePath'] ?? '');update_post_meta($partId,'_wcs_site_option',$option);$site[$kind]=$partId;$updated[]=$kind;
        }
        if($shared)foreach($bundle['menus'] ?? array() as $menu){$kind=explode('-',$menu['key'])[0];if(!in_array($kind,$updated,true))continue;$site['menus'][$menu['key']]=wcs_create_menu($menu,$key,$operation,$createdMenus);}
        if(!$pageId){$pageId=wp_insert_post(array('post_type'=>'page','post_title'=>$title,'post_status'=>'draft'),true);if(is_wp_error($pageId))throw new RuntimeException($pageId->get_error_message());$createdPage=true;$createdPosts[]=$pageId;}else wp_save_post_revision($pageId);
        wcs_save_part($pageId,$bundle['parts']['page'],$editor,$title);
        update_post_meta($pageId,'_wcs_links_option',$option);update_post_meta($pageId,'_wcs_site_option',$shared?$option:'');update_post_meta($pageId,'_wcs_managed','1');update_post_meta($pageId,'_wp_page_template','wcs-full-width');
        $sourcePath=$bundle['sourcePath'] ?? ($bundle['sourceManifest']['entry'] ?? '');
        if($sourcePath){$site['paths'][wcs_normalize_path($sourcePath)]=$pageId;update_post_meta($pageId,'_wcs_source_path',$sourcePath);}
        $site['key']=$key;$site['editor']=$editor;
        update_option($option,$site,false);
        $postUpdate=array('ID'=>$pageId,'post_title'=>$title,'post_status'=>$status);if($slug!==null && $slug!=='')$postUpdate['post_name']=$slug;
        $saved=wp_update_post(wp_slash($postUpdate),true);if(is_wp_error($saved))throw new RuntimeException(esc_html($saved->get_error_message()));
        foreach($createdPosts as $id)if($id!==$pageId)wp_update_post(array('ID'=>$id,'post_status'=>'publish'));
        if($editor==='elementor')\Elementor\Plugin::$instance->files_manager->clear_cache();
        $result=array('pageId'=>$pageId,'status'=>$status,'pageUrl'=>$status==='publish'?get_permalink($pageId):get_preview_post_link($pageId),'editUrl'=>admin_url('post.php?post='.$pageId.'&action='.($editor==='elementor'?'elementor':'edit')),'sharedParts'=>array('header'=>$shared?($site['header'] ?? null):null,'footer'=>$shared?($site['footer'] ?? null):null),'menuIds'=>$shared?($site['menus'] ?? array()):array(),'message'=>($createdPage?'Created':'Updated').' page. '.($updated?'Shared '.implode(' and ',$updated).' updated.':'Existing shared parts kept.'),'warnings'=>array('Source JavaScript runs on the frontend. Configure form submission actions in WordPress separately.'));
        update_option($operationOption,array('hash'=>$hash,'result'=>$result,'created'=>time()),false);$committed=true;
        return rest_ensure_response($result);
    }catch(Throwable $error){
        if(!$committed){update_option($option,$before,false);if($snapshot && $pageId)wcs_restore($pageId,$snapshot);foreach($createdPosts as $id)wp_delete_post($id,true);foreach($createdMenus as $id)wp_delete_nav_menu($id);}
        return wcs_error($error->getMessage().' Page and shared-part changes were rolled back. Uploaded media and immutable assets may remain for reuse.',500);
    }finally{delete_option($lock);}
}
