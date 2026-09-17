<?php
function media_call($data){$req=new WP_REST_Request('POST','/wcs/v1/media');$req->set_header('content-type','application/json');$req->set_body(wp_json_encode($data));$response=rest_do_request($req);if($response->get_status()>=400)throw new Exception(wp_json_encode($response->get_data()));return $response->get_data();}
$raw=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=');
$job=media_call(array('action'=>'init','filename'=>'assets/test.png','size'=>strlen($raw)));$id=$job['id'];
$chunk=array('action'=>'chunk','id'=>$id,'offset'=>0,'data'=>base64_encode(substr($raw,0,30)));
$one=media_call($chunk);$replay=media_call($chunk);verify($one['offset']===30 && $replay['offset']===30,'media: chunk replay is idempotent');
$status=media_call(array('action'=>'status','id'=>$id));verify($status['offset']===30,'media: status resumes acknowledged bytes');
$rejected=false;try{media_call(array('action'=>'complete','id'=>$id));}catch(Throwable $e){$rejected=true;}verify($rejected,'media: incomplete image cannot be imported');
$rejected=false;try{media_call(array('action'=>'chunk','id'=>$id,'offset'=>0,'data'=>base64_encode('wrong')));}catch(Throwable $e){$rejected=true;}verify($rejected,'media: conflicting replay is rejected');
media_call(array('action'=>'chunk','id'=>$id,'offset'=>30,'data'=>base64_encode(substr($raw,30))));
$thumbs=0;add_filter('intermediate_image_sizes_advanced',function($sizes)use(&$thumbs){$thumbs++;return $sizes;});
$done=media_call(array('action'=>'complete','id'=>$id));$again=media_call(array('action'=>'complete','id'=>$id));verify($done===$again,'media: complete replay returns same URL');
$attachments=get_posts(array('post_type'=>'attachment','post_status'=>'inherit','meta_key'=>'_wcs_image_hash','meta_value'=>hash('sha256',$raw)));verify(count($attachments)===1,'media: one attachment for repeated completion');
$meta=wp_get_attachment_metadata($attachments[0]->ID);verify($meta['width']===1 && $meta['height']===1 && $thumbs===0,'media: dimensions retained without synchronous thumbnail processing');
$second=media_call(array('action'=>'init','filename'=>'another/path.png','size'=>strlen($raw)));media_call(array('action'=>'chunk','id'=>$second['id'],'offset'=>0,'data'=>base64_encode($raw)));$duplicate=media_call(array('action'=>'complete','id'=>$second['id']));verify($duplicate['urls']['another/path.png']===$done['urls']['assets/test.png'],'media: separate jobs reuse equal image content');
$url=$done['urls']['assets/test.png'];$rewritten=wcs_rewrite_media(array('html'=>'<img src="assets/test.png">','css'=>'a{background:url(assets/test.png)}','native'=>array('url'=>'assets/test.png')),$done['urls']);verify(strpos($rewritten['html'],$url)!==false && strpos($rewritten['css'],$url)!==false && $rewritten['native']['url']===$url,'media: mapping rewrites HTML CSS and native widget image URLs');

// Native Site Icon is validated and reflected in WordPress head tags.
$canvas=imagecreatetruecolor(512,512);ob_start();imagepng($canvas);$iconBytes=ob_get_clean();imagedestroy($canvas);
$iconUrls=wcs_upload_images(array(array('filename'=>'site-icon.png','data'=>'data:image/png;base64,'.base64_encode($iconBytes))));
$iconReq=new WP_REST_Request('POST','/wcs/v1/identity');$iconReq->set_header('content-type','application/json');$iconReq->set_body(wp_json_encode(array('faviconUrl'=>$iconUrls['site-icon.png'])));
$iconResponse=rest_do_request($iconReq);verify($iconResponse->get_status()===200 && get_option('site_icon')>0,'identity: uploaded square image sets native Site Icon');
ob_start();wp_site_icon();$tags=ob_get_clean();verify(strpos($tags,'site-icon.png')!==false,'identity: WordPress outputs favicon head tags');
$iconReq->set_body(wp_json_encode(array('faviconUrl'=>$url)));verify(rest_do_request($iconReq)->get_status()===400,'identity: undersized images are rejected');
$iconReq->set_body(wp_json_encode(array('faviconUrl'=>'https://example.org/arbitrary.png')));verify(rest_do_request($iconReq)->get_status()===403,'identity: arbitrary remote URLs cannot change icon');
