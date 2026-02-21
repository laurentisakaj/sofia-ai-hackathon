/**
 * backend/bokun.js — Bokun partner tour integration
 */

import {
  BOKUN_SEARCH_URL,
  BOKUN_PRODUCT_LIST_ID,
  BOKUN_EXPERIENCE_BASE,
  BOKUN_BOOKING_BASE,
  BOKUN_CACHE_TTL,
  getBokunCache,
  setBokunCache,
} from '../lib/config.js';

const fetchPartnerTours = async (query = '', category = '') => {
  const now = Date.now();
  const cache = getBokunCache();
  let allTours;

  if (cache.data && (now - cache.timestamp) < BOKUN_CACHE_TTL) {
    allTours = cache.data;
  } else {
    try {
      const res = await fetch(`${BOKUN_SEARCH_URL}?currency=EUR&lang=en_GB`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productListId: BOKUN_PRODUCT_LIST_ID, page: 1, pageSize: 50 }),
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) throw new Error(`Bokun API returned ${res.status}`);
      const data = await res.json();

      allTours = (data.items || []).map(item => ({
        id: item.id,
        title: item.title,
        excerpt: item.excerpt || '',
        durationText: item.durationText || '',
        price: item.price ? `€${item.price.amount}` : 'N/A',
        priceAmount: item.price?.amount || 999,
        rating: item.reviewAverageScore || null,
        reviewCount: item.reviewCount || 0,
        categories: (item.categories || []).map(c => c.title?.toLowerCase()).filter(Boolean),
        photoUrl: item.keyPhoto?.derived?.find(d => d.width >= 300)?.url || item.keyPhoto?.original?.url || null,
        bookingUrl: `${BOKUN_EXPERIENCE_BASE}/${item.id}`
      }));
      setBokunCache({ data: allTours, timestamp: now, totalHits: data.totalHits || allTours.length });
    } catch (e) {
      console.error('[BOKUN] Fetch error:', e.message);
      if (cache.data) {
        allTours = cache.data;
      } else {
        return { status: 'error', message: 'Unable to load tours at the moment.' };
      }
    }
  }

  let filtered = allTours;
  if (query || category) {
    const q = (query + ' ' + category).toLowerCase().trim();
    const keywords = q.split(/\s+/).filter(Boolean);
    filtered = allTours.map(tour => {
      let score = 0;
      const titleLower = tour.title.toLowerCase();
      const catStr = tour.categories.join(' ');
      const excerptLower = (tour.excerpt || '').toLowerCase();
      keywords.forEach(kw => {
        if (titleLower.includes(kw)) score += 3;
        if (catStr.includes(kw)) score += 2;
        if (excerptLower.includes(kw)) score += 1;
      });
      return { ...tour, _score: score };
    }).filter(t => t._score > 0).sort((a, b) => b._score - a._score);

    if (filtered.length === 0) filtered = allTours.slice(0, 5);
  }

  const updatedCache = getBokunCache();
  return {
    status: 'success',
    tours: filtered.slice(0, 8),
    total: updatedCache.totalHits || allTours.length,
    query: query || undefined,
    bookingUrl: `${BOKUN_BOOKING_BASE}?partialView=1`
  };
};

export { fetchPartnerTours };
