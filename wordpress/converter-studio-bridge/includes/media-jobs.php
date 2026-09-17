<?php
if (!defined('ABSPATH')) exit;
// Small requests, offset acknowledgements and per-job file locks make retries safe.
function wcs_media_job($data) {
    $action=$data['action'] ?? '';
    if($action==='init') {
        $name=$data['filename'] ?? ''; $size=$data['size'] ?? 0;
        if(!is_string($name) || !$name || strpos($name,'..')!==false || !is_int($size) || $size<1 || $size>32*MB_IN_BYTES)throw new RuntimeException('Choose images between 1 byte and 32 MB each.');
        $types=array('png'=>'png','jpg'=>'jpeg','jpeg'=>'jpeg','webp'=>'webp','gif'=>'gif','avif'=>'avif','svg'=>'svg+xml','ico'=>'x-icon','bmp'=>'bmp');
        $type=$types[strtolower(pathinfo($name,PATHINFO_EXTENSION))] ?? null;
        if(!$type)throw new RuntimeException('Unsupported image type.');
        require_once ABSPATH.'wp-admin/includes/file.php';
        $file=wp_tempnam('wcs-media');if(!$file)throw new RuntimeException('Temporary storage unavailable.');
        $id=wp_generate_uuid4();
        update_option('wcs_media_'.$id,array('file'=>$file,'filename'=>$name,'size'=>$size,'mime'=>$type,'created'=>time(),'owner'=>get_current_user_id()),false);
        wp_schedule_single_event(time()+DAY_IN_SECONDS,'wcs_expire_media',array($id));
        return array('id'=>$id,'offset'=>0);
    }
    $id=$data['id'] ?? '';if(!is_string($id) || !preg_match('/^[a-f0-9-]{36}$/D',$id))throw new RuntimeException('Invalid media job.');
    $key='wcs_media_'.$id;$job=get_option($key);
    if(!$job)throw new RuntimeException('Upload expired. Reselect this image to start again.');
    if(!empty($job['owner']) && (int)$job['owner']!==get_current_user_id())throw new RuntimeException('This upload belongs to another WordPress user.');
    if(isset($job['urls']))return array('id'=>$id,'offset'=>$job['size'],'urls'=>$job['urls']);
    $handle=fopen($job['file'],'c+b');if(!$handle || !flock($handle,LOCK_EX))throw new RuntimeException('Upload is busy. Retry shortly.');
    try {
        // Refresh after obtaining the lock, including a concurrent completed request.
        wp_cache_delete($key,'options');$job=get_option($key);
        if(isset($job['urls']))return array('id'=>$id,'offset'=>$job['size'],'urls'=>$job['urls']);
        $offset=fstat($handle)['size'];
        if($action==='chunk') {
            if(!is_string($data['data'] ?? null) || strlen($data['data'])>350000)throw new RuntimeException('Image chunk exceeds the request limit.');
            $raw=base64_decode($data['data'],true);$start=$data['offset'] ?? -1;
            if($raw===false || strlen($raw)<1 || strlen($raw)>256*1024 || !is_int($start) || $start<0 || $start+strlen($raw)>$job['size'])throw new RuntimeException('Invalid image chunk.');
            if($start<$offset){fseek($handle,$start);if(fread($handle,strlen($raw))!==$raw)throw new RuntimeException('Conflicting upload chunk.');}
            elseif($start===$offset){fseek($handle,$offset);if(fwrite($handle,$raw)!==strlen($raw))throw new RuntimeException('Could not store image chunk.');fflush($handle);$offset+=strlen($raw);}
            else throw new RuntimeException('Upload offset mismatch. Retry this image.');
        } elseif($action==='complete') {
            if($offset!==$job['size'])throw new RuntimeException('Image upload is incomplete.');
            rewind($handle);$raw=stream_get_contents($handle);
            // Serialize equal-content imports across different jobs as well as retries.
            $hash=hash('sha256',$raw);$hashLock=fopen(get_temp_dir().'wcs-'. $hash.'.lock','c');
            if(!$hashLock || !flock($hashLock,LOCK_EX))throw new RuntimeException('Image import is busy.');
            try {$urls=wcs_upload_images(array(array('filename'=>$job['filename'],'data'=>'data:image/'.$job['mime'].';base64,'.base64_encode($raw))));}
            finally {flock($hashLock,LOCK_UN);fclose($hashLock);}
            $job['urls']=$urls;update_option($key,$job,false);
            return array('id'=>$id,'offset'=>$offset,'urls'=>$urls);
        } elseif($action!=='status')throw new RuntimeException('Unknown media action.');
        return array('id'=>$id,'offset'=>$offset);
    } finally {flock($handle,LOCK_UN);fclose($handle);if(isset($job['urls']) && is_file($job['file']))wp_delete_file($job['file']);}
}
add_action('wcs_expire_media',function($id){$key='wcs_media_'.$id;$job=get_option($key);if($job && is_file($job['file']))wp_delete_file($job['file']);delete_option($key);});
