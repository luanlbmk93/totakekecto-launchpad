/** On-chain strings are stored in tokenInfo; huge calldata (e.g. base64 data URIs) OOGs or RPCs return "missing revert data". */
export const CREATE_TOKEN_MAX_IMAGE_URL_LEN = 4096;
export const CREATE_TOKEN_MAX_DESCRIPTION_LEN = 8000;

/**
 * @returns `null` if OK, otherwise a short user-facing error (PT).
 */
export function validateCreateTokenMetadata(imageUrl: string, description: string): string | null {
  const img = (imageUrl ?? '').trim();
  if (img.toLowerCase().startsWith('data:')) {
    return 'Não uses imagem em base64 (data:image/...) no campo do URL: a transação fica enorme e a BSC reverte sem explicar. Mete a imagem no imgbb, Cloudflare R2, IPFS, etc., e cola um link https:// curto.';
  }
  if (img.length > CREATE_TOKEN_MAX_IMAGE_URL_LEN) {
    return `O link da imagem tem de ter no máximo ${CREATE_TOKEN_MAX_IMAGE_URL_LEN} caracteres (URLs normais cabem).`;
  }
  const desc = (description ?? '').trim();
  if (desc.length > CREATE_TOKEN_MAX_DESCRIPTION_LEN) {
    return `A descrição tem de ter no máximo ${CREATE_TOKEN_MAX_DESCRIPTION_LEN} caracteres.`;
  }
  return null;
}
