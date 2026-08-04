const SUPABASE_URL = 'https://nsmppwnpdxomjmgrtqka.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zbXBwd25wZHhvbWptZ3J0cWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NDM3NjksImV4cCI6MjA2NzExOTc2OX0.gVzJ4uPAmFT5yngvdcFsHXHH1cUL-nIq0e71Gx8ALOk';
fetch(`${SUPABASE_URL}/rest/v1/app_users?email=in.(bknqwe19@gmail.com,bkn1919@gmail.com)&select=id,email,role,tenant_id,auth_id`, {
  headers: { 'apikey': ANON_KEY }
}).then(r => r.json()).then(console.log).catch(console.error);
