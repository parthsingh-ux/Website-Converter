<?php
if(!defined('WP_UNINSTALL_PLUGIN'))exit;
// Retain imported pages, assets, menus and their mappings; remove temporary jobs only.
function wcs_remove_temporary_uploads(){
 $cron=_get_cron_array();
 foreach($cron as $hooks){foreach($hooks['wcs_expire_media']??array() as $event){$id=$event['args'][0]??'';if(!preg_match('/^[a-f0-9-]{36}$/D',$id))continue;$job=get_option('wcs_media_'.$id);$file=realpath($job['file']??'');$temp=realpath(get_temp_dir());if($file&&$temp&&strpos($file,trailingslashit($temp))===0&&strpos(basename($file),'wcs-media')===0)wp_delete_file($file);delete_option('wcs_media_'.$id);}}
 wp_unschedule_hook('wcs_expire_media');
}
if(is_multisite()){foreach(get_sites(array('fields'=>'ids','number'=>0)) as $site){switch_to_blog($site);wcs_remove_temporary_uploads();restore_current_blog();}}else wcs_remove_temporary_uploads();
