export function getQueryParam(param: string): string | null {
  // Handle hash-based routing (common in Chrome extensions)
  const hash = window.location.hash;
  if (hash) {
    // Handle format: #/q=hi
    if (hash.includes('/' + param + '=')) {
      const parts = hash.split(param + '=');
      if (parts[1]) {
        return parts[1].split('&')[0].split('/')[0];
      }
    }
    
    // Handle format: #/?q=hi
    const searchParams = new URLSearchParams(hash.split('?')[1]);
    const result = searchParams.get(param);
    if (result) return result;
  }
  
  // Fallback to regular query params
  return new URLSearchParams(window.location.search).get(param);
}
