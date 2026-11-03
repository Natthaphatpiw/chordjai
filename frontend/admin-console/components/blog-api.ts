export const blogAdminBase='/api/v1/analytics/admin/blog';
export class BlogApiError extends Error{constructor(message:string,public status:number,public code:string){super(message);}}
export async function blogRequest<T>(path:string,init:RequestInit={},base=blogAdminBase):Promise<T>{
 const response=await fetch(base+path,{...init,signal:init.signal??AbortSignal.timeout(30_000),credentials:'same-origin',cache:'no-store',headers:{...(init.body instanceof FormData?{}:{'Content-Type':'application/json'}),...init.headers}});
 let body;try{body=await response.json();}catch{throw new BlogApiError('ไม่สามารถติดต่อระบบได้ / The server could not be reached.',response.status,'INVALID_RESPONSE');}
 if(!response.ok)throw new BlogApiError(body.error?.message??'บันทึกไม่สำเร็จ / Could not save changes.',response.status,body.error?.code??'REQUEST_FAILED');
 return body.data as T;
}
export type UploadedBlogImage={id:string;url:string;publicUrl:string;width:number;height:number};
export function adminImageUrl(url:string){return url.replace('/api/v1/analytics/blog/images/','/api/v1/analytics/admin/blog/images/');}
const englishErrors:Record<string,string>={
 DASHBOARD_LOGIN_REQUIRED:'Your session expired. Sign in again to continue.',
 DASHBOARD_LOGIN_FAILED:'The username or password is incorrect.',
 DASHBOARD_LOGIN_LIMIT:'There have been too many sign-in attempts. Please wait 15 minutes.',
 DASHBOARD_NOT_CONFIGURED:'Dashboard credentials are not configured correctly. Check the backend username and password hash, then redeploy.',
 DASHBOARD_ORIGIN_REJECTED:'This request came from an unauthorised website. Open the studio on the configured admin domain.',
 BLOG_UPGRADE_REQUIRED:'Apply database upgrade 28 before using the blog studio.',
 BLOG_VERSION_CONFLICT:'This article changed in another window. Your edits are still here. Download a copy, then select this article again to load the latest version before saving.',
 BLOG_PERMALINK_LOCKED:'The URL and language are fixed after first publication. Create a new article if you need a different URL or language.',
 BLOG_ARCHIVED:'This article is archived. Restore it as a draft before editing.',
 BLOG_NOT_ARCHIVED:'This article is not archived.',
 BLOG_NOT_FOUND:'This article could not be found. Refresh the article list and try again.',
 BLOG_PUBLISH_INCOMPLETE:'Before publishing, add a title and URL of at least 3 characters, an author name, and at least 20 characters of article text.',
 BLOG_IMAGE_ALT_REQUIRED:'Add alternative text to the cover and every image in the article before publishing. Select an image to edit its description.',
 BLOG_IMAGE_NOT_READY:'An image is not ready or was not uploaded through the blog studio. Upload it again before saving.',
 BLOG_RESERVED_SLUG:'This URL is reserved by the system. Choose another article URL.',
 BLOG_TOO_LARGE:'This article is too large. Split it into smaller articles or shorten its content.',
 BLOG_INVALID_IMAGE:'Choose a readable JPG, PNG or WebP image up to 3.5 MB.',
 BLOG_IMAGE_NOT_FOUND:'This article image could not be found.',
 BLOG_IMAGE_INVALID:'This image could not be loaded. Upload another image.',
 BLOG_IMAGE_TIMEOUT:'The image took too long to load. Please try again.',
 BLOG_UPLOAD_FAILED:'The image could not be uploaded. Please try again.',
 BLOG_IMAGE_LIMIT:'The limit of 60 image uploads for this hour has been reached. Please try later.',
 BLOG_WRITE_LIMIT:'There have been too many article updates. Please wait a minute before trying again.',
 BLOG_FILTER_INVALID:'Choose a valid article status filter.',
 BLOG_LANGUAGE_INVALID:'Choose Thai or English as the article language.',
 BLOG_PAGE_INVALID:'This article page is not valid. Return to the first page.',
 STORAGE_NOT_CONFIGURED:'Image storage is not configured. Check the backend Blob storage configuration.',
 VALIDATION_ERROR:'Check the article fields and formatting. Use an English URL with lowercase letters, numbers and hyphens, up to 10 tags of 40 characters, and supported text or image blocks.',
 CONFLICT:'This article URL is already in use. Choose a different URL for this draft.',
 JSON_TOO_LARGE:'This article is too large to save. Split it into smaller articles.',
 BODY_TOO_LARGE:'This upload is too large. Choose an image up to 3.5 MB.',
 INVALID_JSON:'The article request could not be read. Keep a draft copy and reload the studio.',
 INVALID_ID:'The article or image identifier is not valid.',
 REQUEST_RATE_LIMIT:'There have been too many requests. Please wait a moment and try again.',
 FORBIDDEN:'Your account does not have access to this action.',
 INVALID_RESPONSE:'The server could not be reached. Please try again.',
};
/** Never show untranslated server messages in the English writing workspace. */
export function blogErrorMessage(error:unknown,locale:'th'|'en'):string{
 if(error instanceof BlogApiError){
  if(locale==='th')return error.message||'ไม่สามารถทำรายการได้ กรุณาลองใหม่';
  return englishErrors[error.code]??(error.status===401?'Sign in again to continue.':error.status===429?'There have been too many requests. Please wait a moment and try again.':'The request could not be completed. Your unsaved article remains on this page. Please try again.');
 }
 if(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name))return locale==='th'?'ระบบใช้เวลานานกว่าปกติ เนื้อหาของคุณยังอยู่ กรุณาลองใหม่':'The request took too long. Your article is still here. Please try again.';
 return error instanceof Error&&error.message?error.message:locale==='th'?'ไม่สามารถทำรายการได้ กรุณาลองใหม่':'The request could not be completed. Please try again.';
}
