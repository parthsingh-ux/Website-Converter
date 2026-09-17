'use client';
import styles from './converter.module.css';
export default function HeaderFooterMode({shared,onChange,disabled=false}){
 return <div><label className={styles.field}>Header and footer<select disabled={disabled} value={shared?'global':'content'} onChange={e=>onChange(e.target.value==='global')}><option value="global">Global — shared across pages</option><option value="content">Inside content — separate for each page</option></select></label><p className={styles.help}>{shared?'Create or reuse shared header and footer templates for this site key.':'Keep the supplied header and footer in each page’s editable content. This page will not use the shared templates.'}</p></div>;
}
