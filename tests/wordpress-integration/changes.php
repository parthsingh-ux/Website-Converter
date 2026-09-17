<?php
$all=array();
for($i=1;$i<=10;$i++){
 $name='image'.$i.'.jpg';$raw=file_get_contents('/tests/'.$name);
 $job=media_call(array('action'=>'init','filename'=>$name,'size'=>strlen($raw)));
 for($offset=0;$offset<strlen($raw);$offset+=256*1024)media_call(array('action'=>'chunk','id'=>$job['id'],'offset'=>$offset,'data'=>base64_encode(substr($raw,$offset,256*1024))));
 $done=media_call(array('action'=>'complete','id'=>$job['id']));$all=array_merge($all,$done['urls']);
}
verify(count($all)===10 && count(array_unique($all))===3,'sample images: ten filenames resolve to three unique image files');
$remembered=wcs_saved_media_urls();foreach($all as $name=>$url)verify(($remembered[$name] ?? '')===$url,'sample images: remembers '.$name.' after separate upload');
$uploads=wp_upload_dir();$fake=trailingslashit($uploads['url']).'image8.jpg';
$rewritten=wcs_rewrite_media(array('src'=>'image8.jpg','html'=>'<img src="'.$fake.'">','css'=>'a{background:url(image8.jpg)}'),$remembered);
verify($rewritten['src']===$all['image8.jpg'] && strpos($rewritten['css'],$all['image8.jpg'])!==false && strpos($rewritten['html'],$all['image8.jpg'])!==false,'sample images: local names and missing absolute upload URLs resolve aliases');
$home=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Active Home','post_name'=>'active-home'));
$about=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Active About','post_name'=>'active-about'));
$created=array();$menu=wcs_create_menu(array('key'=>'header-1','items'=>array(array('key'=>'1','parent'=>'0','label'=>'Home','url'=>'index.html'),array('key'=>'2','parent'=>'0','label'=>'About','url'=>'about.html'))),'active','active-navigation-check',$created);
$site=array('menus'=>array('header-1'=>$menu),'paths'=>array('index.html'=>$home,'about.html'=>$about));
$html='<nav data-wcs-menu="header-1"><a data-wcs-item="1" class="active nav-link" aria-current="page" href="index.html">Home</a><a data-wcs-item="2" class="nav-link" href="about.html">About</a></nav>';
foreach(array($home=>'Home',$about=>'About') as $id=>$label){
 $GLOBALS['wp_query']=new WP_Query(array('page_id'=>$id));$GLOBALS['wp_the_query']=$GLOBALS['wp_query'];
 $out=wcs_dynamic_menus($html,$site);$doc=new DOMDocument();$doc->loadHTML($out);$xp=new DOMXPath($doc);$active=$xp->query('//a[@aria-current="page"]');verify($active->length===1 && $active->item(0)->textContent===$label,'navigation: only '.$label.' is current on its page');
}
$req=new WP_REST_Request('POST','/wcs/v1/homepage');$req->set_header('content-type','application/json');$req->set_body(wp_json_encode(array('pageId'=>$home)));$result=rest_do_request($req);
verify($result->get_status()===200 && get_option('show_on_front')==='page' && (int)get_option('page_on_front')===$home,'homepage: published page becomes the WordPress static homepage');
$GLOBALS['wp_query']=new WP_Query(array('page_id'=>$home));$GLOBALS['wp_the_query']=$GLOBALS['wp_query'];
verify(strpos(wcs_dynamic_menus($html,$site),'aria-current="page"')!==false && get_permalink($home)===home_url('/'),'navigation: homepage link resolves to site root and stays current');
$draft=wp_insert_post(array('post_type'=>'page','post_status'=>'draft','post_title'=>'Draft home'));$req->set_body(wp_json_encode(array('pageId'=>$draft)));verify(rest_do_request($req)->get_status()===400 && (int)get_option('page_on_front')===$home,'homepage: draft rejected without changing current homepage');
update_option('page_for_posts',$about);$req->set_body(wp_json_encode(array('pageId'=>$about)));verify(rest_do_request($req)->get_status()===409,'homepage: posts page cannot also become static homepage');

verify(wcs_rewrite_media('images/image8.jpg',$remembered)===$all['image8.jpg'],'sample images: flat uploads resolve unique nested source filenames');
verify(wcs_rewrite_media('https://example.org/image8.jpg',$remembered)==='https://example.org/image8.jpg','sample images: external image URLs remain unchanged');
verify(wcs_rewrite_media('missing/logo.png',array('a/logo.png'=>'https://one.test/a.png','b/logo.png'=>'https://one.test/b.png'))==='missing/logo.png','sample images: ambiguous basename is not guessed');
