import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, Check, ChevronDown, Download, FileArchive, FileImage, FileText, Github, Image as ImageIcon, Lock, Menu, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2, UploadCloud, X, Zap } from 'lucide-react'
import { convertFile, createPreview, downloadBlob, downloadZip, extensionOf, formatBytes, formatMap } from './converters.js'

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'
const MAX_SIZE = 50 * 1024 * 1024

function Header() {
  const [open, setOpen] = useState(false)
  return <header className="site-header">
    <a className="brand" href="#top" aria-label="Rizzconvert home"><span className="brand-mark"><ArrowRight size={18}/></span><span>Rizz<span>convert</span></span></a>
    <nav className={open ? 'nav open' : 'nav'}>
      <a href="#converter">Converter</a><a href="#formats">Format</a><a href="#privacy">Privasi</a>
      <a className="github-link" href="https://github.com/adacmiawcs" target="_blank" rel="noreferrer"><Github size={17}/> GitHub</a>
    </nav>
    <button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Buka menu">{open ? <X/> : <Menu/>}</button>
  </header>
}

function FileRow({ item, onRemove, onDownload }) {
  const outputSize = item.results?.reduce((sum, result) => sum + result.blob.size, 0)
  return <article className={`file-row ${item.status}`}>
    <div className="thumb">{item.preview ? <img src={item.preview} alt=""/> : item.ext === 'pdf' ? <FileText/> : <FileImage/>}</div>
    <div className="file-details">
      <div className="file-title"><strong title={item.file.name}>{item.file.name}</strong><span className="format-badge">{item.ext}</span></div>
      <span>{formatBytes(item.file.size)}{item.status === 'done' && outputSize ? ` · hasil ${formatBytes(outputSize)}` : ''}</span>
      {item.status === 'converting' && <div className="mini-progress"><i style={{width: `${item.progress}%`}}/></div>}
      {item.status === 'error' && <span className="error-copy">{item.error}</span>}
    </div>
    <div className="row-status">
      {item.status === 'done' ? <><span className="done-label"><Check size={15}/> Selesai</span><button onClick={() => onDownload(item)} className="icon-action" aria-label="Download hasil"><Download size={19}/></button></> :
       item.status === 'converting' ? <span className="percent">{item.progress}%</span> :
       <button onClick={() => onRemove(item.id)} className="icon-action remove" aria-label="Hapus file"><Trash2 size={18}/></button>}
    </div>
  </article>
}

function App() {
  const inputRef = useRef(null)
  const previewUrlsRef = useRef(new Set())
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [quality, setQuality] = useState(85)
  const [target, setTarget] = useState('jpg')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const availableTargets = useMemo(() => {
    if (!files.length) return ['jpg', 'png', 'webp', 'pdf']
    return [...new Set(files.flatMap(item => formatMap[item.ext] || []))]
  }, [files])

  useEffect(() => {
    if (!availableTargets.includes(target)) setTarget(availableTargets[0] || 'jpg')
  }, [availableTargets, target])

  useEffect(() => () => previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url)), [])

  const addFiles = async (incoming) => {
    setNotice('')
    const valid = []
    for (const file of [...incoming]) {
      const ext = extensionOf(file)
      if (!formatMap[ext]) { setNotice(`“${file.name}” bukan format yang didukung.`); continue }
      if (file.size > MAX_SIZE) { setNotice(`“${file.name}” melebihi batas 50 MB.`); continue }
      valid.push({ id: crypto.randomUUID(), file, ext, preview: '', status: 'ready', progress: 0, results: null })
    }
    if (!valid.length) return
    setFiles(prev => [...prev, ...valid])
    valid.forEach(async item => {
      try {
        const preview = await createPreview(item.file)
        if (preview.startsWith('blob:')) previewUrlsRef.current.add(preview)
        setFiles(prev => prev.map(current => current.id === item.id ? {...current, preview} : current))
      } catch { /* A missing preview must never block conversion. */ }
    })
  }

  const handleDrop = (event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }
  const removeFile = (id) => setFiles(prev => {
    const item = prev.find(file => file.id === id)
    if (item?.preview?.startsWith('blob:')) {
      URL.revokeObjectURL(item.preview)
      previewUrlsRef.current.delete(item.preview)
    }
    return prev.filter(file => file.id !== id)
  })

  const runConversion = async () => {
    if (!files.length || busy) return
    setBusy(true); setNotice('')
    const queue = files.filter(item => item.status !== 'done')
    for (const item of queue) {
      const supported = formatMap[item.ext] || []
      const actualTarget = supported.includes(target) ? target : supported[0]
      setFiles(prev => prev.map(f => f.id === item.id ? {...f, status: 'converting', progress: 4, error: ''} : f))
      try {
        const results = await convertFile(item.file, actualTarget, quality, progress => setFiles(prev => prev.map(f => f.id === item.id ? {...f, progress} : f)))
        setFiles(prev => prev.map(f => f.id === item.id ? {...f, status: 'done', progress: 100, results, actualTarget} : f))
      } catch (error) {
        setFiles(prev => prev.map(f => f.id === item.id ? {...f, status: 'error', error: error.message || 'Konversi gagal.'} : f))
      }
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    localStorage.setItem('rizzconvert-used', 'true')
    setBusy(false)
  }

  const downloadItem = async (item) => {
    if (item.results.length === 1) downloadBlob(item.results[0].blob, item.results[0].name)
    else downloadZip(item.results)
  }
  const allResults = files.flatMap(item => item.results || [])
  const clearAll = () => {
    files.forEach(item => {
      if (item.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(item.preview)
        previewUrlsRef.current.delete(item.preview)
      }
    })
    setFiles([]); setNotice('')
  }

  return <div id="top">
    <Header/>
    <main>
      <section className="hero">
        <h1>Ubah format file.<br/><em>Bukan privasimu.</em></h1>
        <div className="hero-proof"><span><ShieldCheck/> File tidak diunggah</span><span><Zap/> Cepat & gratis</span><span><Lock/> Tanpa tracking pribadi</span></div>
        <ArrowDown className="scroll-arrow"/>
      </section>

      <section className="converter-shell" id="converter">
        <div className="converter-head">
          <div><span className="step-pill">01</span><h2>Pilih file</h2><p>Tambahkan satu atau beberapa file sekaligus.</p></div>
          {files.length > 0 && <button className="text-btn" onClick={clearAll}><Trash2 size={16}/> Hapus semua</button>}
        </div>

        <div className={`dropzone ${dragging ? 'dragging' : ''} ${files.length ? 'compact' : ''}`}
          onDragEnter={e => {e.preventDefault(); setDragging(true)}} onDragOver={e => e.preventDefault()} onDragLeave={e => {if (e.currentTarget === e.target) setDragging(false)}} onDrop={handleDrop}
          onClick={() => inputRef.current?.click()} role="button" tabIndex="0" onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}>
          <input ref={inputRef} type="file" multiple accept={ACCEPTED} onChange={e => {addFiles(e.target.files); e.target.value = ''}}/>
          <div className="upload-icon"><UploadCloud/></div>
          <div><strong>{files.length ? 'Tambah file lainnya' : 'Tarik & lepas file di sini'}</strong><span>atau <u>pilih dari perangkat</u></span></div>
          <small>JPG, PNG, WEBP, HEIC, atau PDF · Maks. 50 MB/file</small>
        </div>
        {notice && <div className="notice"><X size={16}/>{notice}</div>}

        {files.length > 0 && <>
          <div className="file-list">
            <div className="list-label"><span>{files.length} file dipilih</span><span>Total {formatBytes(files.reduce((sum, item) => sum + item.file.size, 0))}</span></div>
            {files.map(item => <FileRow key={item.id} item={item} onRemove={removeFile} onDownload={downloadItem}/>) }
          </div>

          <div className="settings-block">
            <div className="settings-title"><span className="step-pill">02</span><div><h2>Atur output</h2><p>Pilih format dan kualitas hasil.</p></div></div>
            <div className="settings-grid">
              <div className="setting"><label>Konversi ke</label><div className="format-options">
                {availableTargets.map(format => <button key={format} className={target === format ? 'active' : ''} onClick={() => setTarget(format)}>{format.toUpperCase()}</button>)}
              </div></div>
              <div className={`setting quality ${target === 'png' || target === 'pdf' ? 'muted' : ''}`}><label>Kualitas <b>{quality}%</b></label>
                <input aria-label="Kualitas output" type="range" min="10" max="100" value={quality} disabled={target === 'png' || target === 'pdf'} onChange={e => setQuality(Number(e.target.value))} style={{'--range': `${quality}%`}}/>
                <div className="range-labels"><span>Lebih kecil</span><span>Lebih tajam</span></div>
              </div>
            </div>
          </div>

          <div className="action-bar">
            <div><Lock size={18}/><span><strong>Diproses secara lokal</strong><small>File tidak pernah meninggalkan browser Anda</small></span></div>
            {files.every(file => file.status === 'done') && !busy ? <button className="primary-button" onClick={() => downloadZip(allResults)}><FileArchive/> Download semua <span>ZIP</span></button> :
              <button className="primary-button" onClick={runConversion} disabled={busy || files.every(f => f.status === 'done')}>
                {busy ? <><RefreshCw className="spin"/> Mengonversi...</> : <><Sparkles/> Konversi {files.length} file <ArrowRight/></>}
              </button>}
          </div>
        </>}
      </section>

      <section className="formats" id="formats">
        <div className="section-kicker">Format populer</div><h2>Satu alat untuk format<br/>yang paling kamu butuhkan.</h2>
        <div className="format-grid">
          <div className="format-card coral"><span><ImageIcon/></span><h3>HEIC → JPG / PNG</h3><p>Buka foto iPhone di perangkat dan platform apa pun.</p><div>HEIC <ArrowRight/> JPG</div></div>
          <div className="format-card lime"><span><RefreshCw/></span><h3>PNG · JPG · WebP</h3><p>Ubah format gambar untuk web, desain, atau berbagi.</p><div>PNG <ArrowRight/> WEBP</div></div>
          <div className="format-card lavender"><span><FileText/></span><h3>Gambar ↔ PDF</h3><p>Jadikan foto dokumen PDF, atau ekstrak setiap halamannya.</p><div>JPG <ArrowRight/> PDF</div></div>
        </div>
      </section>

      <section className="privacy" id="privacy">
        <div className="privacy-icon"><ShieldCheck/></div><div><div className="section-kicker">Privasi sebagai standar</div><h2>File-mu hanya milikmu.</h2><p>Rizzconvert memproses semua file langsung di perangkat menggunakan teknologi browser. Tidak ada upload ke server, tidak ada salinan, dan tidak ada yang bisa kami lihat.</p>
          <div className="privacy-points"><span><Check/> Berjalan tanpa server</span><span><Check/> Metadata gambar dibersihkan</span><span><Check/> Sumber terbuka & transparan</span></div></div>
      </section>
    </main>
    <footer><a className="brand" href="#top"><span className="brand-mark"><ArrowRight size={16}/></span><span>Rizz<span>convert</span></span></a><p>Dibuat dengan privasi, untuk semua. © 2026 Rizz-series.</p><div><a href="#privacy">Privasi</a><a href="https://github.com/adacmiawcs" target="_blank" rel="noreferrer">GitHub</a></div></footer>
  </div>
}

export default App
