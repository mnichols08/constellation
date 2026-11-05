// What counts as a technology: recognized manifest entries, how they group on
// the map, and which ones are too incidental to draw. Manifests are parsed as
// data and never executed.

const NPM = {
  react: 'React', 'react-dom': 'React', 'react-native': 'React Native', expo: 'React Native', vue: 'Vue', nuxt: 'Nuxt', '@angular/core': 'Angular', svelte: 'Svelte', '@sveltejs/kit': 'SvelteKit', next: 'Next.js', gatsby: 'Gatsby', '@remix-run/react': 'Remix', 'solid-js': 'SolidJS', astro: 'Astro', jquery: 'jQuery',
  vite: 'Vite', 'react-scripts': 'Create React App', webpack: 'Webpack', parcel: 'Parcel',
  tailwindcss: 'Tailwind CSS', bootstrap: 'Bootstrap', 'react-bootstrap': 'Bootstrap', '@mui/material': 'Material UI', '@material-ui/core': 'Material UI', '@chakra-ui/react': 'Chakra UI', antd: 'Ant Design', 'styled-components': 'styled-components', '@emotion/react': 'Emotion', sass: 'Sass', 'node-sass': 'Sass', 'semantic-ui-react': 'Semantic UI', '@mantine/core': 'Mantine', daisyui: 'daisyUI', 'framer-motion': 'Framer Motion', motion: 'Framer Motion', 'lucide-react': 'lucide',
  redux: 'Redux', '@reduxjs/toolkit': 'Redux', 'react-redux': 'Redux', zustand: 'Zustand', '@tanstack/react-query': 'TanStack Query', 'react-query': 'TanStack Query', 'react-router': 'React Router', 'react-router-dom': 'React Router', 'react-hook-form': 'React Hook Form', formik: 'Formik', zod: 'Zod', yup: 'Yup', axios: 'Axios', d3: 'D3', 'chart.js': 'Chart.js', recharts: 'Recharts', leaflet: 'Leaflet', three: 'Three.js',
  express: 'Express', '@nestjs/core': 'NestJS', fastify: 'Fastify', koa: 'Koa', hono: 'Hono', '@hapi/hapi': 'Hapi',
  mongoose: 'MongoDB', mongodb: 'MongoDB', pg: 'PostgreSQL', postgres: 'PostgreSQL', mysql: 'MySQL', mysql2: 'MySQL', sqlite3: 'SQLite', 'better-sqlite3': 'SQLite', redis: 'Redis', ioredis: 'Redis', prisma: 'Prisma', '@prisma/client': 'Prisma', sequelize: 'Sequelize', typeorm: 'TypeORM', 'drizzle-orm': 'Drizzle', knex: 'Knex', '@supabase/supabase-js': 'Supabase', firebase: 'Firebase', 'firebase-admin': 'Firebase',
  passport: 'Passport', jsonwebtoken: 'JWT', 'next-auth': 'Auth.js', '@clerk/clerk-react': 'Clerk', '@clerk/nextjs': 'Clerk', '@auth0/auth0-react': 'Auth0', 'socket.io': 'Socket.IO', 'socket.io-client': 'Socket.IO', graphql: 'GraphQL', '@apollo/client': 'GraphQL', 'apollo-server': 'GraphQL', stripe: 'Stripe', '@stripe/stripe-js': 'Stripe', 'swagger-ui-express': 'Swagger', nodemailer: 'Nodemailer', cloudinary: 'Cloudinary',
  jest: 'Jest', vitest: 'Vitest', mocha: 'Mocha', cypress: 'Cypress', '@playwright/test': 'Playwright', '@testing-library/react': 'Testing Library', supertest: 'Supertest',
  openai: 'OpenAI', '@anthropic-ai/sdk': 'Anthropic', langchain: 'LangChain', '@google/generative-ai': 'Gemini', '@google/genai': 'Gemini', ai: 'Vercel AI SDK',
};
const PYTHON = {
  django: 'Django', djangorestframework: 'Django', flask: 'Flask', fastapi: 'FastAPI', sqlalchemy: 'SQLAlchemy', psycopg2: 'PostgreSQL', 'psycopg2-binary': 'PostgreSQL', psycopg: 'PostgreSQL', asyncpg: 'PostgreSQL', pymongo: 'MongoDB', pandas: 'pandas', numpy: 'NumPy', pytest: 'pytest', streamlit: 'Streamlit', openai: 'OpenAI', anthropic: 'Anthropic', langchain: 'LangChain', 'scikit-learn': 'scikit-learn', tensorflow: 'TensorFlow', torch: 'PyTorch', redis: 'Redis', celery: 'Celery', supabase: 'Supabase', 'google-generativeai': 'Gemini', 'google-genai': 'Gemini',
};
const JVM = [[/spring-boot/i, 'Spring Boot'], [/hibernate|spring-boot-starter-data-jpa/i, 'Hibernate'], [/postgresql/i, 'PostgreSQL'], [/mysql/i, 'MySQL']];

export const LANGUAGE_GROUP = 'Languages';
// Ring order runs clockwise from the top left.
export const TECH_GROUPS = [
  { id: LANGUAGE_GROUP, color: '#eef2ff', core: true },
  { id: 'Frontend & build', color: '#5cc8ff', techs: ['React', 'React Native', 'Vue', 'Nuxt', 'Angular', 'Svelte', 'SvelteKit', 'Next.js', 'Gatsby', 'Remix', 'SolidJS', 'Astro', 'jQuery', 'Streamlit', 'Flutter', 'Vite', 'Create React App', 'Webpack', 'Parcel'] },
  { id: 'Styling', color: '#f28bd3', techs: ['Tailwind CSS', 'Bootstrap', 'Material UI', 'Chakra UI', 'Ant Design', 'styled-components', 'Emotion', 'Sass', 'Semantic UI', 'Mantine', 'daisyUI', 'Framer Motion', 'lucide'] },
  { id: 'App libraries', color: '#b7a6ff', techs: ['Redux', 'Zustand', 'TanStack Query', 'React Router', 'React Hook Form', 'Formik', 'Zod', 'Yup', 'Axios', 'D3', 'Chart.js', 'Recharts', 'Leaflet', 'Three.js', 'pandas', 'NumPy', 'scikit-learn'] },
  { id: 'Testing', color: '#8fe6dc', techs: ['Jest', 'Vitest', 'Mocha', 'Cypress', 'Playwright', 'Testing Library', 'Supertest', 'pytest', 'RSpec'] },
  { id: 'Services & AI', color: '#ff9a6b', techs: ['Passport', 'JWT', 'Auth.js', 'Clerk', 'Auth0', 'Socket.IO', 'GraphQL', 'Stripe', 'Swagger', 'Nodemailer', 'Cloudinary', 'Docker', 'OpenAI', 'Anthropic', 'LangChain', 'Gemini', 'Vercel AI SDK', 'TensorFlow', 'PyTorch'] },
  { id: 'Data', color: '#ffc857', techs: ['MongoDB', 'PostgreSQL', 'MySQL', 'SQLite', 'Redis', 'Prisma', 'Sequelize', 'TypeORM', 'Drizzle', 'Knex', 'Supabase', 'Firebase', 'SQLAlchemy', 'Hibernate'] },
  { id: 'Backend', color: '#7be08a', techs: ['Express', 'NestJS', 'Fastify', 'Koa', 'Hono', 'Hapi', 'Django', 'Flask', 'FastAPI', 'Rails', 'Laravel', 'Spring Boot', '.NET', 'Celery', 'Gin'] },
];
const GROUP_OF = new Map(TECH_GROUPS.flatMap((group) => (group.techs || []).map((tech) => [tech, group.id])));
export const techGroup = (tech) => GROUP_OF.get(tech) || null;

// Listed in the tables, but left off the map: usually a by-product of another
// choice (Create React App installs Testing Library) rather than a choice itself.
export const SUPPORTING_TECHS = new Set(['lucide', 'Emotion', 'Testing Library', 'Supertest']);
// Build scripts and duplicates of a framework that is already its own star.
const INCIDENTAL_LANGUAGES = new Set(['Shell', 'Batchfile', 'PowerShell', 'Dockerfile', 'Makefile', 'SCSS', 'Sass', 'Less', 'Vue', 'Svelte', 'EJS', 'Handlebars', 'Pug', 'Mako', 'Twig', 'Blade', 'MDX', 'GLSL', 'PLpgSQL', 'TSQL', 'Procfile', 'Roff', 'Nix']);
export const isIncidentalLanguage = (name) => INCIDENTAL_LANGUAGES.has(name);
/** A language under this share of a repository's code doesn't count as its stack. */
export const MINIMUM_LANGUAGE_SHARE = 0.02;

const MANIFEST = /^(package\.json|requirements[\w.-]*\.txt|Pipfile|pyproject\.toml|Gemfile|pom\.xml|build\.gradle(\.kts)?|composer\.json|go\.mod|Cargo\.toml|pubspec\.yaml|[\w.-]+\.csproj)$/;
const SIGNAL = /^(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|manage\.py)$/;
const SKIPPED_FOLDER = /^(node_modules|\.git|\.github|\.vscode|\.idea|dist|build|public|assets|static|images?|img|docs?|vendor|venv|\.venv|env|__pycache__|coverage|\.next|css|styles?|fonts|tests?|__tests__|migrations)$/i;
const WORKSPACE_FOLDER = /^(apps|packages|services|modules)\//i;
export const fileName = (path) => path.split('/').pop();
export const isManifestPath = (path) => MANIFEST.test(fileName(path));
export const isSignalPath = (path) => SIGNAL.test(fileName(path));
export const isSkippedFolder = (name) => SKIPPED_FOLDER.test(name);
export const isWorkspacePath = (path) => WORKSPACE_FOLDER.test(path);

const lookup = (table, name) => (Object.hasOwn(table, name) ? table[name] : null);
const pythonName = (line) => line.replace(/#.*/, '').trim().split(/[\s=<>!~;[@]/)[0]?.toLowerCase();

function readManifest(file, text, found) {
  const add = (tech) => { if (tech) found.add(tech); };
  if (file === 'package.json') {
    const manifest = JSON.parse(text);
    if (!manifest || typeof manifest !== 'object') return;
    for (const section of [manifest.dependencies, manifest.devDependencies]) {
      if (section && typeof section === 'object') for (const name of Object.keys(section)) add(lookup(NPM, name));
    }
  } else if (file.startsWith('requirements')) {
    for (const line of text.split(/\r?\n/)) add(lookup(PYTHON, pythonName(line) || ''));
  } else if (file === 'pyproject.toml' || file === 'Pipfile') {
    for (const match of text.matchAll(/^\s*"?([A-Za-z][\w.-]{0,100})(?:\[[^\]\n]{0,100}\])?\s*(?:[=<>~!"]|$)/gm)) add(lookup(PYTHON, match[1].toLowerCase()));
  } else if (file === 'Gemfile') {
    if (/gem\s+['"]rails['"]/.test(text)) found.add('Rails');
    if (/gem\s+['"]pg['"]/.test(text)) found.add('PostgreSQL');
    if (/gem\s+['"]sqlite3['"]/.test(text)) found.add('SQLite');
    if (/gem\s+['"]rspec/.test(text)) found.add('RSpec');
  } else if (file === 'composer.json') {
    if (text.includes('laravel/framework')) found.add('Laravel');
  } else if (file.endsWith('.csproj')) {
    found.add('.NET');
  } else if (file === 'pom.xml' || file.startsWith('build.gradle')) {
    for (const [pattern, tech] of JVM) if (pattern.test(text)) found.add(tech);
  } else if (file === 'pubspec.yaml') {
    if (/sdk:\s*flutter/.test(text)) found.add('Flutter');
  } else if (file === 'go.mod') {
    if (text.includes('gin-gonic')) found.add('Gin');
  }
}

/** Technologies declared by one repository's manifests, sorted. A malformed manifest counts as unreadable. */
export function classifyManifests(manifests, signals = []) {
  const found = new Set();
  let unreadable = 0;
  for (const [path, text] of Object.entries(manifests)) {
    try { readManifest(fileName(path), text, found); } catch { unreadable += 1; }
  }
  if (signals.some((signal) => /docker|compose/i.test(signal))) found.add('Docker');
  if (signals.includes('manage.py')) found.add('Django');
  return { technologies: [...found].sort(), unreadable };
}
