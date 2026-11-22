/* Pembaca REST anonim untuk website; sesi login hanya digunakan oleh admin. */
(function () {
  "use strict";
  const config = window.SUPABASE_CONFIG || {};
  let base;
  try { base = new URL(config.url); } catch { return; }
  if (base.protocol !== "https:" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.anonKey || "") || /service_role/i.test(config.anonKey)) return;
  window.MASJID_PUBLIC_CLIENT = {
    from(table) {
      const params = new URLSearchParams(), orders = [];
      let single = false, request;
      const query = {
        select(columns) { params.set("select", columns); return query; },
        eq(column, value) { params.set(column, "eq." + value); return query; },
        order(column, options = {}) {
          orders.push(column + (options.ascending === false ? ".desc" : ".asc") + (options.nullsFirst === false ? ".nullslast" : options.nullsFirst === true ? ".nullsfirst" : ""));
          params.set("order", orders.join(",")); return query;
        },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          if (!request) {
            const url = new URL("/rest/v1/" + encodeURIComponent(table), base);
            url.search = params.toString();
            request = fetch(url, { headers: { apikey: config.anonKey } })
              .then(async response => {
                const data = await response.json();
                if (!response.ok) return { data: null, error: data };
                if (single && (!Array.isArray(data) || data.length > 1)) return { data: null, error: { message: "Respons pengaturan tidak valid." } };
                return { data: single ? data[0] || null : data, error: null };
              });
          }
          return request.then(resolve, reject);
        }
      };
      return query;
    }
  };
})();
