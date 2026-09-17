<?php
if (!defined('ABSPATH')) exit;
function wcs_validate_menus($menus) {
    if(!is_array($menus) || count($menus)>20)return wcs_error('Invalid or excessive menus.');
    $keys=array();
    foreach($menus as $menu){
        $key=$menu['key'] ?? '';if(!preg_match('/^(header|footer)-[0-9]+$/D',$key) || isset($keys[$key]))return wcs_error('Invalid or duplicate menu key.');$keys[$key]=true;
        if(!is_array($menu['items'] ?? null) || count($menu['items'])>200)return wcs_error('Invalid menu items.');
        $seen=array('0'=>true);
        foreach($menu['items'] as $item){
            $id=(string)($item['key'] ?? '');$parent=(string)($item['parent'] ?? '0');$url=$item['url'] ?? '';
            if(!$id || isset($seen[$id]) || !isset($seen[$parent]) || !is_string($url) || preg_match('/^(javascript|data|vbscript):/i',trim($url)) || !is_string($item['label'] ?? null))return wcs_error('Invalid menu hierarchy, label or URL.');
            $seen[$id]=true;
        }
    }
    return true;
}
function wcs_create_menu($menu,$siteKey,$operation,&$created) {
    $id=wp_create_nav_menu('Converter '.$siteKey.' '.$menu['key'].' '.substr(hash('sha256',$operation),0,12));
    if(is_wp_error($id))throw new RuntimeException(esc_html($id->get_error_message()));$created[]=$id;$parents=array('0'=>0);
    foreach($menu['items'] as $item){
        $url=$item['url'];if($url && !preg_match('~^(?:[a-z][a-z0-9+.-]*:|//|#)~i',$url))$url=home_url('/'.ltrim($url,'/'));
        $post=wp_update_nav_menu_item($id,0,array('menu-item-title'=>$item['label'],'menu-item-url'=>$url,'menu-item-type'=>'custom','menu-item-status'=>'publish','menu-item-parent-id'=>$parents[(string)($item['parent'] ?? '0')],'menu-item-target'=>($item['target'] ?? '')==='_blank'?'_blank':''));
        if(is_wp_error($post))throw new RuntimeException(esc_html($post->get_error_message()));$parents[(string)$item['key']]=$post;
        update_post_meta($post,'_wcs_initial_url',$url);update_post_meta($post,'_wcs_source_url',$item['url']);update_post_meta($post,'_wcs_source_key',(string)$item['key']);
    }
    return $id;
}
function wcs_set_anchor_label($anchor,$label) {
    $texts=array();$walk=function($node)use(&$walk,&$texts){foreach($node->childNodes as $child){if($child instanceof DOMText && trim($child->textContent)!=='')$texts[]=$child;elseif($child instanceof DOMElement && !in_array(strtolower($child->tagName),array('svg','i','script','style'),true))$walk($child);}};$walk($anchor);
    if(!$texts){$anchor->appendChild($anchor->ownerDocument->createTextNode($label));return;}
    $texts[0]->nodeValue=$label;for($i=1;$i<count($texts);$i++)$texts[$i]->nodeValue='';
}
function wcs_render_menu_nodes($document,$items,$parent,$prototype,$isList,$depth=0,$prototypes=array()) {
    if($depth>20)return $document->createDocumentFragment();
    $fragment=$document->createDocumentFragment();
    foreach($items as $item){
        if((int)$item->menu_item_parent!==(int)$parent)continue;
        $sourceKey=get_post_meta($item->ID,'_wcs_source_key',true);$itemPrototype=$prototypes[$sourceKey] ?? $prototype;
        $node=$itemPrototype?$itemPrototype->cloneNode(true):$document->createElement($isList?'li':'a');
        if(!isset($prototypes[$sourceKey]) && $node instanceof DOMElement){$node->removeAttribute('id');foreach($node->getElementsByTagName('*') as $descendant)$descendant->removeAttribute('id');}
        // Source submenus are rebuilt from the current native WordPress hierarchy.
        foreach(iterator_to_array($node->getElementsByTagName('ul')) as $sub)if($sub->parentNode)$sub->parentNode->removeChild($sub);
        $anchor=strtolower($node->nodeName)==='a'?$node:$node->getElementsByTagName('a')->item(0);
        if(!$anchor){$anchor=$document->createElement('a');$node->appendChild($anchor);}
        $active=!empty($item->_wcs_target_id) && (int)$item->_wcs_target_id===(int)get_queried_object_id() && !wp_parse_url($item->url,PHP_URL_FRAGMENT);
        foreach(array_merge(array($node),iterator_to_array($node->getElementsByTagName('*'))) as $element){
            if(!$element instanceof DOMElement)continue;
            $classes=preg_split('/\s+/',trim($element->getAttribute('class')));
            $classes=array_diff($classes,array('active','is-active','current','current-menu-item','current_page_item','current-menu-parent','current-menu-ancestor','current_page_parent','current_page_ancestor'));
            $element->setAttribute('class',implode(' ',array_filter($classes)));$element->removeAttribute('aria-current');
        }
        if($active){
            $anchor->setAttribute('aria-current','page');
            $anchor->setAttribute('class',trim($anchor->getAttribute('class').' active is-active current current-menu-item current_page_item'));
            if($isList)$node->setAttribute('class',trim($node->getAttribute('class').' active is-active current current-menu-item current_page_item'));
        }
        $anchor->setAttribute('href',esc_url_raw($item->url));wcs_set_anchor_label($anchor,$item->title);
        if($item->target==='_blank'){$anchor->setAttribute('target','_blank');$anchor->setAttribute('rel','noopener noreferrer');}else $anchor->removeAttribute('target');
        if($isList){$node->setAttribute('class',trim($node->getAttribute('class').' menu-item menu-item-'.$item->ID));$children=wcs_render_menu_nodes($document,$items,$item->ID,$prototype,true,$depth+1,$prototypes);if($children->hasChildNodes()){$ul=$document->createElement('ul');$ul->setAttribute('class','sub-menu');$ul->appendChild($children);$node->appendChild($ul);}}
        $fragment->appendChild($node);
    }
    return $fragment;
}
function wcs_dynamic_menus($html,$site) {
    if(strpos($html,'data-wcs-menu')===false || !class_exists('DOMDocument'))return $html;
    $doc=new DOMDocument('1.0','UTF-8');$prior=libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><div id="wcs-fragment">'.$html.'</div>',LIBXML_HTML_NOIMPLIED|LIBXML_HTML_NODEFDTD|LIBXML_NONET);libxml_clear_errors();libxml_use_internal_errors($prior);
    $xpath=new DOMXPath($doc);
    foreach($xpath->query('//*[@data-wcs-menu]') as $nav){
        $key=$nav->getAttribute('data-wcs-menu');$menuId=$site['menus'][$key] ?? 0;if(!$menuId)continue;
        $items=wp_get_nav_menu_items($menuId);if($items===false)continue;
        // Resolve links to converted pages at render time, so later page pushes update navigation.
        foreach($items as $item){$initial=get_post_meta($item->ID,'_wcs_initial_url',true);if($initial && $initial!==$item->url)continue;$source=get_post_meta($item->ID,'_wcs_source_url',true);$normalized=wcs_normalize_path($source);if(isset($site['paths'][$normalized])){$item->url=get_permalink($site['paths'][$normalized]);$query=wp_parse_url($source,PHP_URL_QUERY);$fragment=wp_parse_url($source,PHP_URL_FRAGMENT);if($query)$item->url.=(strpos($item->url,'?')===false?'?':'&').$query;if($fragment)$item->url.='#'.$fragment;}}
        foreach($items as $item)$item->_wcs_target_id=url_to_postid($item->url);
        $list=$nav->getElementsByTagName('ul')->item(0);$target=$list ?: $nav;$prototype=null;
        if(!$list){$anchors=iterator_to_array($nav->getElementsByTagName('a'));if($anchors){$target=$anchors[0]->parentNode;while($target!==$nav){$inside=true;foreach($anchors as $a){$parent=$a->parentNode;while($parent && $parent!==$target)$parent=$parent->parentNode;if(!$parent){$inside=false;break;}}if($inside)break;$target=$target->parentNode;}}}
        $prototypes=array();foreach($nav->getElementsByTagName('a') as $a){$itemKey=$a->getAttribute('data-wcs-item');if(!$itemKey)continue;$node=$a;if($list){while($node->parentNode && strtolower($node->nodeName)!=='li')$node=$node->parentNode;}if($node instanceof DOMElement)$prototypes[$itemKey]=$node;}
        foreach($target->childNodes as $child)if($child instanceof DOMElement && strtolower($child->tagName)===($list?'li':'a')){$prototype=$child;break;}
        if(!$prototype && !$list)continue; // Keep unusual navigation markup intact instead of deleting its controls.
        $originalLinks=array();if(!$list)foreach($target->childNodes as $child)if($child instanceof DOMElement && strtolower($child->tagName)==='a')$originalLinks[]=$child;
        $nodes=wcs_render_menu_nodes($doc,$items,0,$prototype,(bool)$list,0,$prototypes);
        if($list){while($list->firstChild)$list->removeChild($list->firstChild);$list->appendChild($nodes);}else{
            // Replace only source links; mobile toggles, logos and other controls stay in place.
            $target->insertBefore($nodes,$prototype);foreach($originalLinks as $child)$target->removeChild($child);
        }
    }
    $root=$doc->getElementById('wcs-fragment');if(!$root)return $html;$out='';foreach($root->childNodes as $child)$out.=$doc->saveHTML($child);return $out;
}
function wcs_normalize_path($url) { $host=wp_parse_url((string)$url,PHP_URL_HOST);if($host && strtolower($host)!==strtolower((string)wp_parse_url(home_url('/'),PHP_URL_HOST)))return '__external__'.$url;$path=wp_parse_url((string)$url,PHP_URL_PATH);return ltrim(preg_replace('~^\./~','',(string)$path),'/'); }
