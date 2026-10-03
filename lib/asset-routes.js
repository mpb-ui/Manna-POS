import { saveAsset, adjustAsset, disposeAsset, archiveAsset, assetReport, assetDetail } from './assets.js';
import { assetToday, addAssetMonths } from '../public/asset-domain.js';
export function registerAssetRoutes(app,store,admin,audit) {
  const route=(method,path,handler)=>app[method](path,admin,async(req,res,next)=>{try{res.json(await handler(req));}catch(error){next(error);}});
  route('get','/api/assets',async req=>assetReport(await store.read(),req.query.period || assetToday().slice(0,7)));
  route('get','/api/assets/:id',async req=>{const to=req.query.to || assetToday().slice(0,7);return assetDetail(await store.read(),req.params.id,req.query.from || addAssetMonths(to,-11),to);});
  for(const [method,path] of [['post','/api/assets'],['put','/api/assets/:id']])route(method,path,req=>store.mutate(state=>{const asset=saveAsset(state,req.body,req.params.id,req.user.name);audit(state,req.user,req.params.id?'ASSET_UPDATE':'ASSET_CREATE',`Menyimpan aset ${asset.name}`,{assetId:asset.id});return asset;}));
  for(const [path,fn,action] of [['estimate',adjustAsset,'ASSET_ESTIMATE'],['disposal',disposeAsset,'ASSET_DISPOSE']])route('post',`/api/assets/:id/${path}`,req=>store.mutate(state=>{const asset=fn(state,req.params.id,req.body,req.user.name);audit(state,req.user,action,`Memperbarui aset ${asset.name}`,{assetId:asset.id});return asset;}));
  route('delete','/api/assets/:id',req=>store.mutate(state=>{const asset=archiveAsset(state,req.params.id,req.body,req.user.name);audit(state,req.user,'ASSET_ARCHIVE',`Mengarsipkan aset ${asset.name}; riwayat tetap tersimpan`,{assetId:asset.id});return {ok:true};}));
}
