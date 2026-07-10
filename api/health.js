'use strict';

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  let db = false;
  let dbError = null;
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase.from('plans').select('slug').limit(1);
    if (error) { dbError = `${error.code}: ${error.message}`; }
    else { db = Array.isArray(data); }
  } catch (e) {
    dbError = e.message;
  }

  res.status(200).json({ ok: true, db, dbError });
};
