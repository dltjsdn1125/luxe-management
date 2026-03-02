// Supabase 클라이언트 초기화
(function() {
    const SUPABASE_URL = 'https://kjdozdlhcfnhrwagaqnw.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZG96ZGxoY2ZuaHJ3YWdhcW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MTEwMzcsImV4cCI6MjA4Nzk4NzAzN30.gjUX7xs3WHFC-jZLpspv6l5aTtgyhdRDuchs1HhtlHc';

    window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
