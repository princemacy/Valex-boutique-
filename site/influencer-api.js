// Ajouts API pour les vues d’accès délégués : le serveur reste l’autorité.
export async function loadMerchantDelegations({limit=50}={}){return normalizeMerchantDelegations(await rpc("merchant_influencer_delegations",{p_limit:Number.isInteger(limit)?Math.min(100,Math.max(1,limit)):50}));}
