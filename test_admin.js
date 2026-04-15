const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message + '\n' + err.stack));
  page.on('console', msg => { if(msg.type()==='error') errors.push('CONSOLE: '+msg.text()); });

  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.type('input[placeholder="Usuário ou CPF do responsável"]', 'admin');
  await page.type('input[type="password"]', 'accbm2025');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 4000));

  errors.length = 0;

  // Click "Área do Aluno" tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Área do Aluno'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  console.log('=== AFTER Área do Aluno ===');
  console.log(errors.filter(e => e.startsWith('PAGEERROR')));

  errors.length = 0;
  // Now click first student
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    // find a student button in the list
    const studentBtn = btns.find(b => {
      const style = window.getComputedStyle(b);
      return b.textContent.length > 5 && b.textContent.length < 60 && b.closest('[style*="overflow"]');
    });
    if (studentBtn) { console.log('clicking:', studentBtn.textContent); studentBtn.click(); }
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log('=== AFTER clicking student ===');
  console.log(errors.filter(e => e.startsWith('PAGEERROR')));

  errors.length = 0;
  // Click "Contas Alunos" tab  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Contas Alunos'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  console.log('=== AFTER Contas Alunos ===');
  console.log(errors.filter(e => e.startsWith('PAGEERROR')));

  await browser.close();
})().catch(e => console.error('FATAL:', e.message));
