<?php
// Standalone behavioral checks for pure bridge functions; no WordPress installation required.
define('ABSPATH',__DIR__.'/');
function home_url($path='/'){return 'https://example.test'.$path;}
function wp_parse_url($url,$component=-1){return parse_url($url,$component);}
function esc_url_raw($url){return $url;}
function get_permalink($id){return 'https://example.test/?page_id='.$id;}
function get_post_meta($id,$key,$single=true){if($key==='_wcs_initial_url')return $GLOBALS['initial_urls'][$id] ?? '';return $key==='_wcs_source_key'?($GLOBALS['keys'][$id] ?? ''):($GLOBALS['source'][$id] ?? '');}
function wp_get_nav_menu_items($id){return $GLOBALS['items'];}
function wcs_error($message){return $message;}
require __DIR__.'/../wordpress/wordpress-converter-bridge/includes/menus.php';
require __DIR__.'/../wordpress/wordpress-converter-bridge/includes/assets.php';
function check($condition,$message){if(!$condition)throw new Exception($message);echo 'PASS '.$message."\n";}
$GLOBALS['items']=array((object)array('ID'=>10,'menu_item_parent'=>0,'url'=>'https://example.test/about.html','title'=>'About us','target'=>''),(object)array('ID'=>11,'menu_item_parent'=>10,'url'=>'https://other.test/child','title'=>'Our team','target'=>'_blank'),(object)array('ID'=>12,'menu_item_parent'=>0,'url'=>'https://other.test/about.html','title'=>'External','target'=>''));
$GLOBALS['source']=array(10=>'about.html#team',12=>'https://other.test/about.html');
$site=array('menus'=>array('header-1'=>1),'paths'=>array('about.html'=>42));
$sourceHtml='<header><nav data-wcs-menu="header-1"><button class="toggle">Menu</button><ul class="nav-links"><li class="nav-item"><a class="nav-link" href="old.html"><svg><path d="M1 1"/></svg><span>Old</span></a></li></ul></nav></header>';
$out=wcs_dynamic_menus($sourceHtml,$site);
check(strpos($out,'Old')===false && strpos($out,'About us')!==false && strpos($out,'Our team')!==false,'native menu labels replace source content and render nested items');
check(strpos($out,'<button class="toggle">Menu</button>')!==false,'mobile menu toggle is retained');
check(strpos($out,'page_id=42#team')!==false && strpos($out,'https://other.test/about.html')!==false,'local page links are dynamic and external URLs remain external');
check(strpos($out,'class="nav-link"')!==false && strpos($out,'<svg>')!==false,'source classes and icons are retained');
$GLOBALS['items']=array((object)array('ID'=>15,'menu_item_parent'=>0,'url'=>'/new','title'=>'New item','target'=>''));
$out=wcs_dynamic_menus('<nav data-wcs-menu="header-1"><a href="a">Old A</a><button>Menu</button><a href="b">Old B</a></nav>',$site);
check(strpos($out,'Old A')===false && strpos($out,'Old B')===false && substr_count($out,'New item')===1,'direct-anchor navigation does not retain stale links');
$map=array('images/photo.png'=>'https://example.test/uploads/photo.png');
$values=array('image'=>array('url'=>'images/photo.png'),'html'=>'<img src="images/photo.png">','css'=>'.a{background:url(images/photo.png)}','blocks'=>'<!-- wp:gcb/image {"htmlAttributes":{"src":"images/photo.png"}} --><img src="images/photo.png"/>');
$out=wcs_rewrite_media($values,$map);
check($out['image']['url']===$map['images/photo.png'] && substr_count($out['blocks'],$map['images/photo.png'])===2,'media URLs remain consistent between serialized blocks and native settings');
check(strpos($out['css'],'url(https://example.test/uploads/photo.png)')!==false,'CSS media references are localized');

$GLOBALS['items']=array((object)array('ID'=>10,'menu_item_parent'=>0,'url'=>'/one','title'=>'First','target'=>''),(object)array('ID'=>12,'menu_item_parent'=>0,'url'=>'/two','title'=>'Special','target'=>''));
$GLOBALS['keys']=array(10=>'1',12=>'2');
$out=wcs_dynamic_menus('<nav data-wcs-menu="header-1"><div class="links"><a data-wcs-item="1" class="plain" href="one">One</a><a data-wcs-item="2" id="contact-link" class="cta" href="two">Two</a></div><button>Toggle</button></nav>',$site);
check(strpos($out,'id="contact-link" class="cta"')!==false && strpos($out,'Special')!==false,'each original menu item retains its own style and ID inside a navigation wrapper');
