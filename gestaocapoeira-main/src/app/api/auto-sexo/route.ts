import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Terminações de nomes tipicamente femininos em português brasileiro
const TERMINACOES_FEMININAS = ['a', 'ane', 'ane', 'inha', 'ela', 'elia', 'enia', 'esia', 'icia', 'ina', 'ira', 'isa', 'ita', 'iza', 'lda', 'nde', 'nia', 'oa', 'ola', 'ona', 'ora', 'osa', 'uda', 'uma', 'ura'];

// Nomes masculinos comuns (primeiro nome) — base ampla
const NOMES_MASCULINOS = new Set([
  'abel','abilio','abraao','adauto','adebaldo','adelino','adenilson','adenilton','aderaldo','adilson','adimar',
  'adino','admir','adolfo','adriano','afonso','agostinho','airton','alan','aldo','alexandre','alexsandro',
  'alfredo','alisson','almir','aloísio','aloisio','altamir','altemir','alton','alvanir','alvaro','amaro',
  'americo','amilcar','amilton','amiro','anderson','andre','andrei','andrey','anselmo','antonio','archibald',
  'arlei','arlindo','armando','arnaldo','artur','arthur','augusto','aurelio','axel',
  'baltazar','bento','bernardo','breno','brunno','bruno',
  'caetano','caio','caique','carlos','cassio','cezar','cicero','claudio','cleiton','clemente','clerton',
  'cleuton','clovis','cosme','cristian','cristiano','cristobal',
  'dagoberto','damiao','daniel','danilo','dario','david','davi','deivis','deivison','deivid','denis','denison',
  'dirceu','domingos','donizete','dorival','douglas','duarte','duilio',
  'ederson','edgar','edimilson','edir','edivaldo','edivaldo','edmar','edmilson','edmundo','edney','edvaldo',
  'edvaldo','edwaldo','edwaldo','elcio','elias','elio','elton','emerson','emilio','enrico','enzo','erasmo',
  'eric','erick','erivelton','ernani','ernesto','estevao','euclides','euler','eurico','evaldo','everton',
  'ezequiel',
  'fabiano','fabio','fabricio','fabricio','felipe','fernando','filipe','flavio','francisco','franco','frederico',
  'gabriel','gelson','genilson','geniton','geraldo','geronimo','giancarlo','gilberto','gilmar','gilvandro',
  'glauco','gleison','gleidson','glener','gonzalo','gualter','guilherme','gustavo',
  'hamilton','heitor','helton','henrique','hercules','heverton','hilario','hiram','horlando','humberto',
  'iago','igor','ilton','irineu','isaias','isac','isaque','isidoro','israel','ivan','ivisson',
  'jacinto','jaime','janio','jarbas','jefferson','jeronimo','jesse','jesus','joel','joao','jodo','jonas',
  'jonathan','jordi','jorge','jose','joseas','josivaldo','josue','joao','juan','julio','junio','jurandir',
  'kelton','kelvin','kleber','kleiton',
  'laercio','lauro','lazaro','leandro','leo','leonel','leonides','leopoldino','leopoldo','leudimar','levi',
  'lincoln','lindomar','lineu','livio','lourival','luacian','lucas','luciano','luiz','luis',
  'marcelo','marcio','marcos','mario','mario','marlon','mateus','matheus','mauricio','mauro','maxwell',
  'messias','miguel','milton','moises',
  'natanael','nelinho','nelson','neto','newton','nilson','noel',
  'odilon','odimar','olegario','olimpio','oscar','osmar','osvaldo','otavio',
  'pablo','paulo','pedro','petrucio','rafael','raimundo','ramon','regis','reginaldo','reinaldo','renato',
  'ricardo','rinaldo','robson','rodrigo','rogerio','rolando','romario','ronaldo','ronan','ronei','roney',
  'ronildo','rosivaldo','rudimar','rui','ruy',
  'samuel','sandoval','sandro','sebastiao','sergio','sidnei','silas','silvano','silvio','simao','sinval',
  'socrates','tarcisio','tiago','timoteo','tito','tobias','tome','tony','tulio',
  'ubiratan','ulisses','umberto','valmir','vanderlei','vando','vanuito','vasco','victor','vinicius',
  'vitor','waldo','wanderlei','washington','wellington','wemerson','weslei','wesley','willian','william',
  'wilson','wolney','xande','yago','yuri','zacarias','zaqueu',
]);

// Nomes femininos comuns — base ampla
const NOMES_FEMININOS = new Set([
  'abigail','adriana','agatha','agda','agnaldo','agnes','albertina','alessandra','alessia','alex','alexa',
  'alice','aline','aliny','alissa','alivane','alzira','amalia','amanda','amelia','ana','analia','ananda',
  'andrea','andreia','andressa','anelise','angelica','angelina','anita','annamaria','antonia',
  'aparecida','aprigia','ariana','ariela','arlete','armelinda','arolda','astrid','audrey','aurora',
  'barbara','beatriz','bernadete','bertha','bianca','brenda','brigida','bruna',
  'carine','carla','carlota','carmelita','carmem','carmen','carolina','caroline','cassandra','catarina',
  'celia','cibele','cilene','clara','claudia','claudiane','cleide','clemencia','cleonice',
  'dalva','damaris','daniela','danielle','danielle','dany','debora','deise','denise','diana','dilma',
  'dulce',
  'edna','elaine','elenita','eliane','elisa','elisabete','elisangela','elisangela','eliza','elsa',
  'emilia','emilyane','erika','ester','eunice','eva','evelia','evelyn',
  'fabiana','fabiele','fatima','fernanda','flavia','francisca','francine',
  'gabriela','gabrielle','geovana','geovanna','gertrude','giovana','giovanna','gisele','giseli','gislaine',
  'glaucia','gleice','graziela','grazi',
  'heloisa','henria','hilma',
  'iara','ingrid','iris','irma','isabela','isabele','isabelle','isadora','isis','itala',
  'jacqueline','janaina','jaqueline','jaqueline','jaqueline','jasmine','jeniffer','jessica','joana',
  'josefa','josefina','joyce','julia','juliana','julianne',
  'kamila','karla','karen','katia','keila','kelly','kely',
  'laila','larissa','laura','layla','lea','leandra','leila','leticia','lidia','lilian','liliana','lorena',
  'louisa','luanda','luane','lucia','luciana','luisa','luiza','luna','lyvia',
  'madalena','maira','marcela','marcia','margarida','mari','maria','mariana','mariangela','marilene',
  'marilia','marina','marineia','maristela','marta','mayara','mayra','meire','melissa','mikaela',
  'milena','mirela','miriam','misericordia','monica','morgana',
  'nadia','nalva','natalia','nathalia','nayara','neuza','nicole','nikolle','nilma','nisa','noelia',
  'odete','olivia',
  'paloma','pamela','patricia','paula','paola','petra','priscila','priscilla',
  'rafaela','raissa','raquel','regiane','regiane','renata','rita','roberta','rosa','rosana','rosangela',
  'rosaria','rosemeire','rosemeri','rosimeire','rossana','rozangela',
  'sabrina','samara','samira','sandra','sara','sarah','sheila','silmara','silvia','simone','sinara',
  'sonia','sophia','stefania','stefany','stephanie','sueli','suzana','suzi',
  'talita','tania','tatiana','tatiane','thaisa','thalita','thamara','thayane','thaysa','thifany',
  'tiffany','tomasa','tania',
  'valentina','valeria','vanessa','vera','veronica','vivian','viviane',
  'wanda','wendeline',
  'yara','yasmin','yolanda',
]);

function detectSexo(nomeCompleto: string): 'masculino' | 'feminino' | null {
  if (!nomeCompleto) return null;
  const partes = nomeCompleto.trim().toLowerCase().split(/\s+/);
  const primeiro = partes[0];

  // Direct lookup by first name
  if (NOMES_MASCULINOS.has(primeiro)) return 'masculino';
  if (NOMES_FEMININOS.has(primeiro)) return 'feminino';

  // Heuristic: ending in 'a' (not 'ma', 'ta', 'ca' combos that are often masculine like "Agostinha")
  // but many Portuguese male names end in 'o', 'r', 'n', 's', etc.
  if (primeiro.endsWith('son') || primeiro.endsWith('ton') || primeiro.endsWith('lon') ||
      primeiro.endsWith('valdo') || primeiro.endsWith('berto') || primeiro.endsWith('naldo') ||
      primeiro.endsWith('aldo') || primeiro.endsWith('ando') || primeiro.endsWith('indo') ||
      primeiro.endsWith('ardo') || primeiro.endsWith('erto') || primeiro.endsWith('ento') ||
      primeiro.endsWith('aldo') || primeiro.endsWith('urdo') || primeiro.endsWith('ildo') ||
      primeiro.endsWith('anio') || primeiro.endsWith('aulo') || primeiro.endsWith('edro') ||
      primeiro.endsWith('rcio') || primeiro.endsWith('avio') || primeiro.endsWith('ovio') ||
      primeiro.endsWith('elmo') || primeiro.endsWith('ilmo') || primeiro.endsWith('orno') ||
      primeiro.endsWith('ano') || primeiro.endsWith('eno') || primeiro.endsWith('ino') ||
      primeiro.endsWith('uno') || primeiro.endsWith('lio') || primeiro.endsWith('rio')) {
    return 'masculino';
  }

  if (primeiro.endsWith('ana') || primeiro.endsWith('ane') || primeiro.endsWith('iane') ||
      primeiro.endsWith('ela') || primeiro.endsWith('elia') || primeiro.endsWith('ilda') ||
      primeiro.endsWith('ina') || primeiro.endsWith('ira') || primeiro.endsWith('isa') ||
      primeiro.endsWith('ita') || primeiro.endsWith('ize') || primeiro.endsWith('ona') ||
      primeiro.endsWith('nia') || primeiro.endsWith('sia') || primeiro.endsWith('cia') ||
      primeiro.endsWith('lia') || primeiro.endsWith('mia') || primeiro.endsWith('bia') ||
      primeiro.endsWith('gia') || primeiro.endsWith('dia') || primeiro.endsWith('via') ||
      primeiro.endsWith('fia') || primeiro.endsWith('ria') || primeiro.endsWith('tia') ||
      primeiro.endsWith('zia')) {
    return 'feminino';
  }

  // Ends in 'a' likely feminine (exceptions like "Yoshida", "Luca" are edge cases)
  if (primeiro.endsWith('a') && primeiro.length > 3) return 'feminino';

  return null; // cannot determine
}

export async function GET() {
  // Fetch all students without sexo set
  const { data: students, error } = await supabaseAdmin
    .from('students')
    .select('id, nome_completo, sexo')
    .is('sexo', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!students || students.length === 0) {
    return NextResponse.json({ updated: 0, message: 'Nenhum aluno sem sexo definido.' });
  }

  let updated = 0;
  let skipped = 0;
  const details: { nome: string; sexo: string | null }[] = [];

  for (const student of students) {
    const sexo = detectSexo(student.nome_completo);
    if (sexo) {
      const { error: upErr } = await supabaseAdmin
        .from('students')
        .update({ sexo })
        .eq('id', student.id);
      if (!upErr) {
        updated++;
        details.push({ nome: student.nome_completo, sexo });
      }
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    updated,
    skipped,
    total: students.length,
    details,
  });
}
