/**
 * renderer.ts
 * ──────────────────────────────────────────────────────────────────────
 * Gera 3 formatos por produto usando a variação correta (next_variation).
 * ──────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { db, type Variacao, ANGULOS } from '../lib/db.js';
import { gerarRoteiro } from '../services/gemini.js';
import { gerarAudio } from '../services/tts.js';
import { baixarImagem, montarVideo, montarFeed } from '../services/ffmpeg.js';
import { uploadImageKit } from '../services/imagekit.js';

const RENDERS_DIR = path.join(process.cwd(), 'renders');
const TEMP_DIR = path.join(RENDERS_DIR, 'temp');
const REELS_DIR = path.join(RENDERS_DIR, 'reels');
const FEED_DIR = path.join(RENDERS_DIR, 'feed');
const STORIES_DIR = path.join(RENDERS_DIR, 'stories');

async function garantirPastas() {
  for (const dir of [TEMP_DIR, REELS_DIR, FEED_DIR, STORIES_DIR]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function main() {
  console.log('Renderer iniciado...\n');
  await garantirPastas();

  const produto = db.prepare(`
    SELECT * FROM products
    WHERE status = 'PENDING' AND removed_from_ml = 0
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as any;

  if (!produto) {
    console.log('Nenhum produto PENDING ativo.');
    return;
  }

  console.log(`Produto: [${produto.category}] ${produto.name}`);
  console.log(`Preco: R$ ${produto.price}`);

  const variacao = (produto.next_variation ?? 'A') as Variacao;
  console.log(`Variacao: ${variacao} (${ANGULOS[variacao]})`);
  console.log(`Ja publicou: ${produto.variations_done ?? 0}x\n`);

  const audioPath = path.join(TEMP_DIR, `audio-${produto.id}-${variacao}.mp3`);
  const imagemPath = path.join(TEMP_DIR, `img-${produto.id}.jpg`);
  const reelPath = path.join(REELS_DIR, `reel-${produto.id}-${variacao}.mp4`);
  const storyPath = path.join(STORIES_DIR, `story-${produto.id}-${variacao}.mp4`);
  const feedPath = path.join(FEED_DIR, `feed-${produto.id}-${variacao}.jpg`);

  try {
    console.log('[1/5] Gerando roteiro via Gemini...');
    const roteiro = await gerarRoteiro({
      nome: produto.name,
      preco: produto.price,
      precoOriginal: produto.original_price,
      categoria: produto.category,
      variacao,
    });
    console.log(`  Fala: ${roteiro.fala.slice(0, 80)}...`);
    console.log(`  Estilo: ${roteiro.estilo} | Cor: ${roteiro.cor}`);

    console.log('\n[2/5] Gerando audio via Edge TTS...');
    await gerarAudio({ texto: roteiro.fala, outputPath: audioPath });
    console.log('  OK');

    console.log('\n[3/5] Baixando imagem...');
    await baixarImagem(produto.thumbnail, imagemPath);
    console.log('  OK');

    console.log('\n[4/5] Gerando formatos...');
    await montarVideo({
      imagemPath, audioPath,
      titulo: produto.name, preco: produto.price,
      outputPath: reelPath, formato: 'reel',
      estilo: roteiro.estilo, cor: roteiro.cor,
      selo: roteiro.selo, beneficios: roteiro.beneficios, cta: roteiro.cta,
    });
    await montarVideo({
      imagemPath, audioPath,
      titulo: produto.name, preco: produto.price,
      outputPath: storyPath, formato: 'story',
      estilo: roteiro.estilo, cor: roteiro.cor,
      selo: roteiro.selo, beneficios: roteiro.beneficios, cta: roteiro.cta,
    });
    await montarFeed({
      imagemPath,
      titulo: produto.name, preco: produto.price,
      outputPath: feedPath,
      estilo: roteiro.estilo, cor: roteiro.cor,
      selo: roteiro.selo, beneficios: roteiro.beneficios, cta: roteiro.cta,
    });

    console.log('\n[5/5] Upload ImageKit + registrando no banco...');
    const reelUrl = await uploadImageKit(reelPath, 'reels');
    const storyUrl = await uploadImageKit(storyPath, 'stories');
    const feedUrl = await uploadImageKit(feedPath, 'feed');

    const insertRender = db.prepare(`
      INSERT INTO renders
        (product_id, variation, reel_path, reel_url, caption, hashtags, status, variation_angle, image_used)
      VALUES (?, ?, ?, ?, ?, ?, 'READY', ?, ?)
    `);
    const angulo = ANGULOS[variacao];
    insertRender.run(produto.id, variacao, reelPath, reelUrl, roteiro.legenda, roteiro.hashtags.join(' '), angulo, produto.thumbnail);
    insertRender.run(produto.id, variacao, storyPath, storyUrl, roteiro.legenda, roteiro.hashtags.join(' '), angulo, produto.thumbnail);
    insertRender.run(produto.id, variacao, feedPath, feedUrl, roteiro.legenda, roteiro.hashtags.join(' '), angulo, produto.thumbnail);

    db.prepare(`
      UPDATE products
      SET status = 'READY', variation_used = variation_used + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(produto.id);

    console.log('  3 renders registrados');
    console.log('\nSUCESSO!');
  } finally {
    await fs.unlink(imagemPath).catch(() => {});
    await fs.unlink(audioPath).catch(() => {});
    console.log('\nTemporarios limpos.');
  }
}

main().catch((err) => {
  console.error('\nERRO FATAL:', err.message || err);
  process.exit(1);
});