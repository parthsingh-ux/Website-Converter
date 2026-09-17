<?php
wp_set_current_user(1);
$results=array();
function verify($condition,$message){if(!$condition)throw new Exception($message);$GLOBALS['results'][]=$message;}
function deploy($data){$req=new WP_REST_Request('POST','/wcs/v1/deploy');$req->set_header('content-type','application/json');$req->set_body(wp_json_encode($data));$result=rest_do_request($req);if($result->get_status()>=400)throw new Exception(wp_json_encode($result->get_data()));return $result->get_data();}
try{
 require '/tests/media.php';
 foreach(array('gutenberg','elementor') as $editor){
  $bundle=json_decode(file_get_contents('/tests/'.$editor.'.json'),true);
  $request=array('bundle'=>$bundle,'operationId'=>'integration-create-'.$editor,'status'=>'draft','globalPolicy'=>'keep');
  $first=deploy($request);$id=$first['pageId'];verify(get_post_type($id)==='page',$editor.': creates a real WordPress page');
  verify($first['sharedParts']['header'] && $first['sharedParts']['footer'],$editor.': creates separate global parts');
  $same=deploy($request);verify($same['pageId']===$id,$editor.': retry returns same page');
  if($editor==='elementor'){$savedData=json_decode(get_post_meta($id,'_elementor_data',true),true);verify(($savedData[0]['settings']['flex_direction'] ?? '')===($bundle['parts']['page']['content'][0]['settings']['flex_direction'] ?? ''),$editor.': native layout settings survive document save');}
  $GLOBALS['wp_query']=new WP_Query(array('page_id'=>$id,'post_status'=>'draft'));$GLOBALS['wp_the_query']=$GLOBALS['wp_query'];$GLOBALS['post']=get_post($id);
  ob_start();include WCS_DIR.'templates/full-width.php';$pageHtml=ob_get_clean();
  verify(strpos($pageHtml,'Shared footer')!==false,$editor.': full template renders shared footer');
  file_put_contents('/tests/'.$editor.'-rendered.html',$pageHtml);
  verify(strpos($pageHtml,'Hello WordPress')!==false && strpos($pageHtml,'42')!==false && strpos($pageHtml,'name="email"')!==false,$editor.': frontend retains heading, table and form');
  $request['pageId']=$id;$request['operationId']='integration-update-'.$editor;$request['bundle']['title']='Updated homepage';
  $updated=deploy($request);verify($updated['pageId']===$id && get_the_title($id)==='Updated homepage',$editor.': updates selected page');verify($updated['sharedParts']===$first['sharedParts'],$editor.': keeps existing shared parts');
  $site=get_option(wcs_site_option('integration',$editor));$header=wcs_render_post($site['header'],$site);
  verify(strpos($header,'page_id='.$id)!==false,$editor.': menu points to created WordPress page');
  $menuId=$site['menus']['header-1'];wp_update_nav_menu_item($menuId,0,array('menu-item-title'=>'New navigation item','menu-item-url'=>'https://example.org/new','menu-item-type'=>'custom','menu-item-status'=>'publish'));
  $header=wcs_render_post($site['header'],$site);verify(strpos($header,'New navigation item')!==false,$editor.': native menu edits render dynamically');
  $before=get_post($id,ARRAY_A);$bad=$request;$bad['operationId']='integration-failure-'.$editor;$bad['globalPolicy']='replace';
  if($editor==='gutenberg')$bad['bundle']['parts']['page']['patternCss'].='/* deliberate ID collision */';else $bad['bundle']['parts']['page']['ecb']['css'].='/* deliberate ID collision */';
  $failed=false;try{deploy($bad);}catch(Throwable $e){$failed=true;}verify($failed,$editor.': asset conflict is rejected');verify(get_post_field('post_content',$id)===$before['post_content'] && get_option(wcs_site_option('integration',$editor))===$site,$editor.': failure restores page and shared-part pointers');
 }
 // A second page with a custom slug must resolve through the first page's shared menu.
 $next=$bundle;$next['title']='Our story';$next['sourcePath']='about.html';$next['parts']['header']=null;$next['parts']['footer']=null;$next['menus']=array();
 $second=deploy(array('bundle'=>$next,'operationId'=>'multi-page-about-elementor','status'=>'publish','slug'=>'our-story','globalPolicy'=>'keep'));
 $site=get_option(wcs_site_option('integration','elementor'));$menu=wcs_render_post($site['header'],$site);
 verify(strpos($menu,get_permalink($second['pageId']))!==false,'second page resolves from original source path after custom naming');
 verify(get_post_field('post_name',$second['pageId'])==='our-story','custom slug is saved');
 require '/tests/changes.php';
 $output=array('ok'=>true,'wordpress'=>get_bloginfo('version'),'elementor'=>ELEMENTOR_VERSION,'checks'=>$results);
}catch(Throwable $e){$output=array('ok'=>false,'error'=>$e->getMessage(),'checks'=>$results);}
file_put_contents('/tests/result.json',wp_json_encode($output,JSON_PRETTY_PRINT));echo wp_json_encode($output);
