// Migration script: add tenant_id column and fill all 120 students
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://edjxhuansqvvllchsvjy.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkanhodWFuc3F2dmxsY2hzdmp5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI4MjExNiwiZXhwIjoyMDg2ODU4MTE2fQ.qW1amMF2rk4MJ_VJvHZcIRDgEwoWtvNmbQOcYORbcD0';

const NUCLEO_TO_TENANT = {
  'Poliesportivo Edson Alves': 'a1000001-0000-4000-8000-000000000001',
  'Poliesportivo do Ipiranga':  'a1000002-0000-4000-8000-000000000002',
  'Saracuruna':                 'a1000003-0000-4000-8000-000000000003',
  'Vila Urussaí':               'a1000004-0000-4000-8000-000000000004',
  'Jayme Fichman':              'a1000005-0000-4000-8000-000000000005',
  'Academia Mais Saúde':        'a1000006-0000-4000-8000-000000000006',
  'Mauá':                       'a1000001-0000-4000-8000-000000000001',
};

const DEFAULT_TENANT = '3a3480c1-e937-4a46-8a27-d5358099e697';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log('=== Migration: add tenant_id to students ===\n');

  // Step 1: Check if tenant_id column exists by attempting a query
  console.log('Step 1: Checking if tenant_id column exists...');
  const { error: checkErr } = await supabase
    .from('students')
    .select('tenant_id')
    .limit(1);

  if (checkErr && checkErr.message.includes('tenant_id')) {
    console.log('Column tenant_id does NOT exist. Need to create it via SQL.');
    console.log('');
    console.log('⚠️  AÇÃO NECESSÁRIA: Execute o seguinte SQL no Supabase Dashboard > SQL Editor:');
    console.log('');
    console.log('--- INÍCIO DO SQL ---');
    console.log('ALTER TABLE students ADD COLUMN IF NOT EXISTS tenant_id TEXT;');
    console.log('ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;');
    console.log('ALTER TABLE students ADD COLUMN IF NOT EXISTS apelido TEXT;');
    console.log('ALTER TABLE students ADD COLUMN IF NOT EXISTS nome_social TEXT;');
    console.log('ALTER TABLE students ADD COLUMN IF NOT EXISTS sexo TEXT;');
    console.log('ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_pai BOOLEAN NOT NULL DEFAULT FALSE;');
    console.log('ALTER TABLE students ADD COLUMN IF NOT EXISTS assinatura_mae BOOLEAN NOT NULL DEFAULT FALSE;');
    console.log('');
    console.log('-- Fill tenant_id based on nucleo:');
    console.log("UPDATE students SET tenant_id = 'a1000001-0000-4000-8000-000000000001' WHERE nucleo = 'Poliesportivo Edson Alves';");
    console.log("UPDATE students SET tenant_id = 'a1000002-0000-4000-8000-000000000002' WHERE nucleo = 'Poliesportivo do Ipiranga';");
    console.log("UPDATE students SET tenant_id = 'a1000003-0000-4000-8000-000000000003' WHERE nucleo = 'Saracuruna';");
    console.log("UPDATE students SET tenant_id = 'a1000004-0000-4000-8000-000000000004' WHERE nucleo = 'Vila Urussaí';");
    console.log("UPDATE students SET tenant_id = 'a1000005-0000-4000-8000-000000000005' WHERE nucleo = 'Jayme Fichman';");
    console.log("UPDATE students SET tenant_id = 'a1000006-0000-4000-8000-000000000006' WHERE nucleo = 'Academia Mais Saúde';");
    console.log("UPDATE students SET tenant_id = 'a1000001-0000-4000-8000-000000000001' WHERE nucleo = 'Mauá';");
    console.log("UPDATE students SET tenant_id = '3a3480c1-e937-4a46-8a27-d5358099e697' WHERE tenant_id IS NULL;");
    console.log('--- FIM DO SQL ---');
    console.log('');
    console.log('Depois de executar o SQL, rode este script novamente para verificar.');
    process.exit(0);
  }

  console.log('Column tenant_id EXISTS ✓');

  // Step 2: Fetch all students
  console.log('\nStep 2: Fetching all students...');
  const { data: students, error: fetchErr } = await supabase
    .from('students')
    .select('id, nome_completo, nucleo, tenant_id');

  if (fetchErr) {
    console.error('Error fetching students:', fetchErr.message);
    process.exit(1);
  }

  console.log(`Found ${students.length} students`);

  // Step 3: Update tenant_id for each student
  console.log('\nStep 3: Updating tenant_id...');
  let updated = 0;
  let alreadyHad = 0;
  let failed = 0;

  for (const student of students) {
    if (student.tenant_id) {
      alreadyHad++;
      continue;
    }

    const tenantId = NUCLEO_TO_TENANT[student.nucleo] ?? DEFAULT_TENANT;
    const { error } = await supabase
      .from('students')
      .update({ tenant_id: tenantId })
      .eq('id', student.id);

    if (error) {
      console.error(`  ✗ Failed ${student.nome_completo}: ${error.message}`);
      failed++;
    } else {
      updated++;
      if (updated <= 5 || updated % 20 === 0) {
        console.log(`  ✓ ${student.nome_completo} → ${tenantId} (${student.nucleo})`);
      }
    }
  }

  console.log(`\n=== Result ===`);
  console.log(`  Total students: ${students.length}`);
  console.log(`  Already had tenant_id: ${alreadyHad}`);
  console.log(`  Updated now: ${updated}`);
  console.log(`  Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n✅ Migration completed successfully!');
  } else {
    console.log('\n⚠️ Some updates failed. Check the errors above.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
