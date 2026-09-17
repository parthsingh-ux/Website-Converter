<?php
/** Resolve source-file links after all destination pages exist. */
if(!defined('ABSPATH'))exit;
function wcs_link_path($path){$out=array();foreach(explode('/',str_replace('\\','/',rawurldecode($path))) as $part){if($part===''||$part==='.')continue;if($part==='..')array_pop($out);else $out[]=$part;}return implode('/',$out);}
function wcs_resolve_page_link($href,$site,$source=''){
 $href=trim($href);if($href===''||$href[0]==='#'||$href[0]==='?')return $href;
 $u=wp_parse_url($href);if($u===false || (isset($u['scheme'])&&!in_array(strtolower($u['scheme']),array('http','https'),true)))return $href;
 $path=$u['path']??'';
 if(isset($u['host'])){$home=wp_parse_url(home_url('/'));if(strtolower($u['host'])!==strtolower($home['host'])||($u['port']??null)!==($home['port']??null))return $href;$prefix=rtrim($home['path']??'','/');if($prefix&&strpos($path,$prefix.'/')===0)$path=substr($path,strlen($prefix));}
 elseif(substr($path,0,1)!=='/'){$base=dirname($source);$path=($base==='.'?'':$base.'/').$path;}
 $path=wcs_link_path($path);$paths=$site['paths']??array();$id=$paths[$path]??0;
 if(!$id){$keys=$path===''?array('index.html','index.htm'):array($path.'/index.html',$path.'/index.htm');if($path!==''&&!pathinfo($path,PATHINFO_EXTENSION))$keys=array_merge($keys,array($path.'.html',$path.'.htm'));$matches=array();foreach($keys as $key)if(isset($paths[$key]))$matches[]=(int)$paths[$key];$matches=array_unique($matches);if(count($matches)===1)$id=reset($matches);}
 if(!$id||get_post_type($id)!=='page'||in_array(get_post_status($id),array('trash','auto-draft'),true))return $href;
 $target=get_permalink($id);if(!$target)return $href;if(!empty($u['query']))$target.=(strpos($target,'?')===false?'?':'&').$u['query'];if(isset($u['fragment']))$target.='#'.$u['fragment'];return $target;
}
function wcs_internal_links($html,$site,$source=''){
 if(!$html||empty($site['paths'])||!class_exists('WP_HTML_Tag_Processor'))return $html;
 $p=new WP_HTML_Tag_Processor($html);$nav=0;
 while($p->next_tag(array('tag_closers'=>'visit'))){
  $tag=$p->get_tag();if($tag==='NAV'){$nav+=($p->is_tag_closer()?-1:1);continue;}if($tag!=='A'||$p->is_tag_closer())continue;
  $href=$p->get_attribute('href');if(!is_string($href)||$p->get_attribute('download')!==null)continue;
  $target=wcs_resolve_page_link($href,$site,$source);if($target!==$href)$p->set_attribute('href',esc_url_raw($target));
  if($nav>0&&$p->get_attribute('data-wcs-item')===null&&get_queried_object_id()&&$href!==''&&$href[0]!=='#'){
   $id=url_to_postid($target);$current=$id&&(int)$id===(int)get_queried_object_id();
   foreach(array('active','is-active','current-menu-item','current_page_item') as $class)$p->remove_class($class);
   $p->remove_attribute('aria-current');if($current){$p->set_attribute('aria-current','page');foreach(array('active','is-active','current-menu-item','current_page_item') as $class)$p->add_class($class);}
  }
 }
 return $p->get_updated_html();
}
