use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
const MASK: u16 = 0x7f;
#[derive(Deserialize)] pub struct Input { pub repositories: Vec<Repository> }
#[derive(Deserialize)] pub struct Repository { pub id:String, pub known_mask:u16, pub present_mask:u16, #[serde(default)] pub inherited_mask:u16, #[serde(default)] pub behavior:BTreeMap<String,u64> }
#[derive(Serialize)] pub struct Output { pub version:u8, pub repositories:Vec<ResultRow>, pub recurrence:Vec<Recurrence> }
#[derive(Serialize)] pub struct ResultRow { pub id:String, pub known_mask:u16, pub present_mask:u16, pub inherited_mask:u16, pub behavior:BTreeMap<String,u64> }
#[derive(Serialize)] pub struct Recurrence { pub slot:u8, pub known:u16, pub present:u16, pub fixed_point:u16 }
pub fn analyze(input:Input)->Result<Output,String>{
 if input.repositories.len()>100{return Err("Stewardship supports at most 100 repositories".into())}
 let mut recurrence=Vec::new();
 for repo in &input.repositories { if repo.id.is_empty()||repo.id.len()>512||repo.known_mask & !MASK != 0||repo.present_mask & !MASK != 0||repo.inherited_mask & !MASK != 0||repo.present_mask & !repo.known_mask != 0||repo.inherited_mask & !repo.present_mask != 0||repo.behavior.len()>32 {return Err("Invalid stewardship evidence".into())} }
 for slot in 0..7 { let bit=1u16<<slot; let known=input.repositories.iter().filter(|r|r.known_mask&bit!=0).count() as u16; let present=input.repositories.iter().filter(|r|r.present_mask&bit!=0).count() as u16; recurrence.push(Recurrence{slot,known,present,fixed_point:if known==0{0}else{((present as u32*1000)/known as u32) as u16}}); }
 Ok(Output{version:1,repositories:input.repositories.into_iter().map(|r|ResultRow{id:r.id,known_mask:r.known_mask,present_mask:r.present_mask,inherited_mask:r.inherited_mask,behavior:r.behavior}).collect(),recurrence})
}
#[cfg(test)] mod tests { use super::*; #[test] fn unknown_is_not_denominator(){let out=analyze(Input{repositories:vec![Repository{id:"a".into(),known_mask:1,present_mask:1,inherited_mask:0,behavior:BTreeMap::new()},Repository{id:"b".into(),known_mask:0,present_mask:0,inherited_mask:0,behavior:BTreeMap::new()}]}).unwrap();assert_eq!(out.recurrence[0].known,1);assert_eq!(out.recurrence[0].fixed_point,1000)}}
