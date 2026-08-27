import type { APIRoute } from 'astro';
import { paths, units } from '@/lib/content/catalog';

export const prerender = true;

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const GET: APIRoute = () => {
  const staticPaths = ['/', '/map', '/library', '/references', '/search', '/review', '/dashboard', '/settings'];
  const urls = [
    ...staticPaths,
    ...units.map((unit) => '/learn/' + unit.metadata.slug),
    ...paths.map((path) => '/paths/' + path.slug),
  ];
  const body = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map((pathname) => '<url><loc>' + escape('https://devops.hamardikan.com' + pathname) + '</loc></url>').join('') +
    '</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
