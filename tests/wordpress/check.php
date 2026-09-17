<?php
wp_set_current_user(1);$checks=array();function check($ok,$msg){if(!$ok)throw new Exception($msg);$GLOBALS['checks'][]=$msg;}
function send($b,$op,$id=0){$r=new WP_REST_Request('POST','/wcs/v1/deploy');$r->set_header('content-type','application/json');$r->set_body(wp_json_encode(array('bundle'=>$b,'operationId'=>'integration-'.$op,'pageId'=>$id,'status'=>'publish','globalPolicy'=>'replace')));$out=rest_do_request($r);if($out->get_status()>=400)throw new Exception(wp_json_encode($out->get_data()));return $out->get_data();}
try{
 foreach(array('gutenberg','elementor') as $editor){
  $b=json_decode(file_get_contents('/tests/'.$editor.'.json'),true);$a=send($b,'global-'.$editor);check(!empty($a['sharedParts']['header']),$editor.' global header created');
  $other=$b;$other['sourcePath']='about.html';$other['title']='Our team';$other['parts']['header']=null;$other['parts']['footer']=null;$other['menus']=array();$about=send($other,'about-'.$editor);
  $site=get_option(wcs_site_option('test-links',$editor));$footer=wcs_render_post($site['footer'],$site);check(strpos($footer,get_permalink($about['pageId']))!==false,$editor.' ordinary footer link resolves');
  $joined=json_decode(file_get_contents('/tests/'.$editor.'-joined.json'),true);$inline=send($joined,'inside-'.$editor,$a['pageId']);check(empty($inline['sharedParts']['header'])&&empty($inline['sharedParts']['footer']),$editor.' inside mode detaches global templates');check(get_option(wcs_site_option('test-links',$editor))['header']===$site['header'],$editor.' other pages shared header retained');
  $html=wcs_render_post($inline['pageId'],get_option(wcs_site_option('test-links',$editor)));check(strpos($html,'Shared brand')!==false&&strpos($html,'Footer about')!==false,$editor.' joined native content contains header and footer');check(strpos($html,get_permalink($about['pageId']))!==false,$editor.' inside content links still resolve');
  $same=send($joined,'inside-'.$editor,$a['pageId']);check($same['pageId']===$inline['pageId'],$editor.' deployment retry idempotent');
 }
 wp_set_current_user(0);check(rest_do_request(new WP_REST_Request('GET','/wcs/v1/status'))->get_status()>=400,'Anonymous requests denied');
 $result=array('ok'=>true,'wordpress'=>get_bloginfo('version'),'elementor'=>ELEMENTOR_VERSION,'checks'=>$checks);
}catch(Throwable $e){$result=array('ok'=>false,'error'=>$e->getMessage(),'checks'=>$checks);}file_put_contents('/tests/result.json',wp_json_encode($result,JSON_PRETTY_PRINT));echo wp_json_encode($result);
