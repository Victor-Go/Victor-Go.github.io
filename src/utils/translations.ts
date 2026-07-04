export interface Translations {
  title: string;
  editor: string;
  preview: string;
  downloadPdf: string;
  exportMarkdown: string;
  saveTemplate: string;
  loadTemplate: string;
  languageLabel: string;
  templateLabel: string;
  fontSizeControls: string;
  elementStyles: string;
  fontSize: string;
  color: string;
  fontFamily: string;
  bold: string;
  italic: string;
  classicCorporate: string;
  creativeModern: string;
  bodyText: string;
  heading1: string;
  heading2: string;
  heading3: string;
  heading4: string;
  heading5: string;
  heading6: string;
  successSave: string;
  successLoad: string;
  noSavedData: string;
  storageError: string;
  defaultResume: string;
  metaDescription: string;
  saveResume: string;
  savedResume: string;
  manageResumes: string;
  slotNamePlaceholder: string;
  saveButton: string;
  deleteButton: string;
  noResumesSaved: string;
  presetThemes: string;
  boldConfig: string;
  italicConfig: string;
  defaultLabel: string;
  normalLabel: string;
  customLabel: string;
  inheritLabel: string;
}

export const translations: Record<
  | "en"
  | "zh"
  | "zh-tw"
  | "fr"
  | "de"
  | "it"
  | "es"
  | "pt"
  | "ja"
  | "ko"
  | "ru"
  | "uk",
  Translations
> = {
  en: {
    title: "Markdown Resume PDF Generator",
    editor: "Markdown Editor",
    preview: "Live PDF Preview",
    downloadPdf: "Print PDF",
    exportMarkdown: "Download MD",
    saveTemplate: "Save Styles",
    loadTemplate: "Load Styles",
    languageLabel: "Language",
    templateLabel: "Resume Layout",
    fontSizeControls: "Global Font Sizes",
    elementStyles: "Markdown Style Overrides",
    fontSize: "Font Size",
    color: "Color",
    fontFamily: "Font Family",
    bold: "Bold",
    italic: "Italic",
    classicCorporate: "Classic Corporate (Serif)",
    creativeModern: "Creative Modern (Accent)",
    bodyText: "Body Text (p)",
    heading1: "Heading 1 (h1)",
    heading2: "Heading 2 (h2)",
    heading3: "Heading 3 (h3)",
    heading4: "Heading 4 (h4)",
    heading5: "Heading 5 (h5)",
    heading6: "Heading 6 (h6)",
    successSave: "Styles saved to local storage!",
    successLoad: "Styles loaded successfully!",
    noSavedData: "No saved style configuration found.",
    storageError: "Storage access failed or quota exceeded.",
    metaDescription: "Generate professional A4 resume PDFs directly in your browser using Markdown. Select layout templates, customize element typography and colors in real-time, and save slots locally.",
    saveResume: "Save Resume",
    savedResume: "Saved Resume",
    manageResumes: "Manage Saved Resumes",
    slotNamePlaceholder: "Enter resume name (e.g. CV 2026)...",
    saveButton: "Save to Cookie",
    deleteButton: "Delete",
    noResumesSaved: "No saved resumes found in cookies.",
    presetThemes: "Preset Color Themes",
    boldConfig: "Bold configuration (font-weight)",
    italicConfig: "Italic configuration (font-style)",
    defaultLabel: "Default",
    normalLabel: "Normal",
    customLabel: "Custom",
    inheritLabel: "Inherit",
    defaultResume: `# John Doe
**Senior Software Engineer**  
📧 john.doe@email.com | 📱 +1 (555) 019-2834 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 Vancouver, Canada

---

## Professional Summary
Detail-oriented and passionate Senior Software Engineer with 8+ years of experience building scalable web applications. Expert in TypeScript, React, Node.js, and cloud architectures.

---

## Experience

### Senior Software Engineer | TechCorp Inc.
*2022 - Present | Vancouver, Canada*
- Led a team of 5 engineers to rebuild the enterprise dashboard, improving load times by **45%**.
- Implemented robust React architectures with TypeScript, reducing runtime errors by **30%**.

### Software Engineer | InnovateWeb LLC
*2019 - 2022 | Austin, TX*
- Developed and launched 4 high-traffic web applications utilizing React and Node.js.
- Authored reusable UI components and shared library packages, streamlining development.

---

## Education

### B.S. in Computer Science | Stanford University
*2015 - 2019 | Stanford, CA*
- Graduated with Honors (GPA: 3.8/4.0).

---

## Skills
- **Languages:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **Frameworks:** React, Next.js, Node.js, Express, TailwindCSS
- **Tools:** Git, AWS (S3, Lambda, RDS), Docker, GitHub Actions
`
  },
  zh: {
    title: "Markdown 简历 PDF 生成器",
    editor: "Markdown 编辑器",
    preview: "实时 PDF 预览",
    downloadPdf: "打印 PDF",
    exportMarkdown: "导出 MD",
    saveTemplate: "保存样式",
    loadTemplate: "加载样式",
    languageLabel: "语言",
    templateLabel: "简历模板",
    fontSizeControls: "全局字体大小",
    elementStyles: "Markdown 元素样式定制",
    fontSize: "字体大小",
    color: "颜色",
    fontFamily: "字体族",
    bold: "加粗",
    italic: "斜体",
    classicCorporate: "经典企业 (衬线)",
    creativeModern: "创意现代 (个性偏侧)",
    bodyText: "正文 (p)",
    heading1: "一级标题 (h1)",
    heading2: "二级标题 (h2)",
    heading3: "三级标题 (h3)",
    heading4: "四级标题 (h4)",
    heading5: "五级标题 (h5)",
    heading6: "六级标题 (h6)",
    successSave: "样式已成功保存至本地存储！",
    successLoad: "样式加载成功！",
    noSavedData: "未找到已保存的样式配置。",
    storageError: "存储访问失败或超出限额。",
    metaDescription: "基于 Markdown 的 A4 网页简历生成器。支持实时自定义排版、多种模板切换、完全本地解析并提供高质量 PDF 导出，信息免上传，安全隐私。",
    saveResume: "保存简历",
    savedResume: "已保存的简历",
    manageResumes: "管理已保存简历",
    slotNamePlaceholder: "输入简历名称 (例如：中文简历 2026)...",
    saveButton: "保存到 Cookie",
    deleteButton: "删除",
    noResumesSaved: "未在 Cookie 中找到保存的简历。",
    presetThemes: "内置配色推荐",
    boldConfig: "粗体配置 (font-weight)",
    italicConfig: "斜体配置 (font-style)",
    defaultLabel: "默认",
    normalLabel: "常规",
    customLabel: "自定义",
    inheritLabel: "继承",
    defaultResume: `# 张三
**高级软件工程师**  
📧 zhangsan@email.com | 📱 +86 138-0000-0000 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 中国·北京

---

## 个人总结
8年以上开发经验的高级软件工程师，热衷于构建高性能、可扩展的 Web 应用程序。精通 TypeScript、React、Node.js 以及云端架构。

---

## 工作经历

### 高级软件工程师 | 科创科技有限公司
*2022 - 至今 | 北京*
- 带领 5 人研发小组重构企业级核心控制台，使首屏加载时间缩短 **45%**。
- 基于 TypeScript 和 React 建立前端规范，使 Web 产品运行错误率降低 **30%**。

### 软件工程师 | 创想网络服务有限公司
*2019 - 2022 | 上海*
- 使用 React、Redux 和 Node.js 研发并成功上线 4 个高并发 Web 应用程序。
- 编写高可复用 UI 组件库与公共工具包，大幅提升团队交付效率。

---

## 教育背景

### 计算机科学与技术 学士 | 清华大学
*2015 - 2019 | 北京*
- 优等生毕业 (GPA: 3.8/4.0)。

---

## 专业技能
- **开发语言:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **框架与库:** React, Next.js, Node.js, Express, TailwindCSS
- **开发工具:** Git, AWS (S3, Lambda, RDS), Docker, GitHub Actions
`
  },
  fr: {
    title: "Générateur de CV Markdown en PDF",
    editor: "Éditeur Markdown",
    preview: "Aperçu PDF en Direct",
    downloadPdf: "Imprimer PDF",
    exportMarkdown: "Exporter MD",
    saveTemplate: "Enregistrer Styles",
    loadTemplate: "Charger Styles",
    languageLabel: "Langue",
    templateLabel: "Disposition du CV",
    fontSizeControls: "Tailles de Police Globales",
    elementStyles: "Surcharges de Style Markdown",
    fontSize: "Taille de Police",
    color: "Couleur",
    fontFamily: "Famille de Polices",
    bold: "Gras",
    italic: "Italique",
    classicCorporate: "Classique d'Entreprise (Serif)",
    creativeModern: "Créatif Moderne (Accent)",
    bodyText: "Texte Principal (p)",
    heading1: "Titre 1 (h1)",
    heading2: "Titre 2 (h2)",
    heading3: "Titre 3 (h3)",
    heading4: "Titre 4 (h4)",
    heading5: "Titre 5 (h5)",
    heading6: "Titre 6 (h6)",
    successSave: "Styles enregistrés dans le stockage local !",
    successLoad: "Styles chargés avec succès !",
    noSavedData: "Aucune configuration de style enregistrée.",
    storageError: "Accès au stockage échoué ou quota dépassé.",
    metaDescription: "Générez des PDF de CV professionnels A4 directement dans votre navigateur avec Markdown. Personnalisez la typographie et les couleurs en direct.",
    saveResume: "Sauvegarder CV",
    savedResume: "已保存的履歷",
    manageResumes: "Gérer les CV Enregistrés",
    slotNamePlaceholder: "Nom du CV (ex: Mon CV 2026)...",
    saveButton: "Enregistrer dans le Cookie",
    deleteButton: "Supprimer",
    noResumesSaved: "Aucun CV trouvé dans les cookies.",
    presetThemes: "Thèmes de Couleur Prédéfinis",
    boldConfig: "Configuration gras (font-weight)",
    italicConfig: "Configuration italique (font-style)",
    defaultLabel: "Par défaut",
    normalLabel: "Normal",
    customLabel: "Personnalisé",
    inheritLabel: "Hériter",
    defaultResume: `# Jean Dupont
**Ingénieur Logiciel Senior**  
📧 jean.dupont@email.com | 📱 +33 6 12 34 56 78 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 Paris, France

---

## Résumé Professionnel
Ingénieur logiciel senior passionné, fort de plus de 8 ans d'expérience dans la création d'applications web évolutives. Expert en TypeScript, React et architectures cloud.

---

## Expérience Professionnelle

### Ingénieur Logiciel Senior | TechCorp Inc.
*2022 - Présent | Paris, France*
- Direction d'une équipe de 5 ingénieurs pour reconstruire le tableau de bord d'entreprise, réduisant les temps de chargement de **45%**.
- Implémentation d'architectures React robustes avec TypeScript, réduisant les erreurs d'exécution de **30%**.

### Ingénieur Logiciel | InnovateWeb LLC
*2019 - 2022 | Lyon, France*
- Développement et lancement de 4 applications web à fort trafic basées sur React et Node.js.
- Rédaction de composants UI réutilisables, accélérant la vitesse globale de développement de l'équipe.

---

## Éducation

### Licence en Informatique | Sorbonne Université
*2015 - 2019 | Paris, France*
- Diplômé avec Mention Très Bien.

---

## Compétences
- **Langages :** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **Frameworks :** React, Next.js, Node.js, Express, TailwindCSS
- **Outils :** Git, AWS (S3, Lambda), Docker, GitHub Actions
`
  },
  de: {
    title: "Markdown zu PDF Lebenslauf-Generator",
    editor: "Markdown-Editor",
    preview: "Live-PDF-Vorschau",
    downloadPdf: "PDF drucken",
    exportMarkdown: "MD exportieren",
    saveTemplate: "Stile speichern",
    loadTemplate: "Stile laden",
    languageLabel: "Sprache",
    templateLabel: "Lebenslauf-Layout",
    fontSizeControls: "Globale Schriftgrößen",
    elementStyles: "Markdown-Stilüberschreibungen",
    fontSize: "Schriftgröße",
    color: "Farbe",
    fontFamily: "Schriftfamilie",
    bold: "Fett",
    italic: "Kursiv",
    classicCorporate: "Klassisches Unternehmen (Serif)",
    creativeModern: "Kreativ Modern (Akzent)",
    bodyText: "Textkörper (p)",
    heading1: "Überschrift 1 (h1)",
    heading2: "Überschrift 2 (h2)",
    heading3: "Überschrift 3 (h3)",
    heading4: "Überschrift 4 (h4)",
    heading5: "Überschrift 5 (h5)",
    heading6: "Überschrift 6 (h6)",
    successSave: "Stile im lokalen Speicher gespeichert!",
    successLoad: "Stile erfolgreich geladen!",
    noSavedData: "Keine gespeicherte Stilkonfiguration gefunden.",
    storageError: "Speicherzugriff fehlgeschlagen oder Limit überschritten.",
    metaDescription: "Erstellen Sie professionelle A4-Lebenslauf-PDFs direkt in Ihrem Browser mit Markdown. Passen Sie Typografie und Farben in Echtzeit an.",
    saveResume: "Lebenslauf speichern",
    savedResume: "CV Sauvegardés",
    manageResumes: "Gespeicherte Lebensläufe verwalten",
    slotNamePlaceholder: "Name des Lebenslaufs (z. B. CV 2026)...",
    saveButton: "In Cookie speichern",
    deleteButton: "Löschen",
    noResumesSaved: "Keine gespeicherten Lebensläufe in Cookies gefunden.",
    presetThemes: "Voreingestellte Farbthemen",
    boldConfig: "Fett-Konfiguration (font-weight)",
    italicConfig: "Kursiv-Konfiguration (font-style)",
    defaultLabel: "Standard",
    normalLabel: "Normal",
    customLabel: "Benutzerdefiniert",
    inheritLabel: "Erben",
    defaultResume: `# Max Mustermann
**Senior Softwareentwickler**  
📧 max.mustermann@email.de | 📱 +49 170 1234567 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 Berlin, Deutschland

---

## Berufliche Zusammenfassung
Detailorientierter und leidenschaftlicher Senior Softwareentwickler mit mehr als 8 Jahren Erfahrung im Aufbau skalierbarer Webanwendungen. Experte für TypeScript, React, Node.js und Cloud-Architekturen.

---

## Berufserfahrung

### Senior Softwareentwickler | TechCorp Inc.
*2022 - Gegenwart | Berlin, Deutschland*
- Leitung eines Teams von 5 Entwicklern zum Wiederaufbau des Enterprise-Dashboards, wodurch die Ladezeit um **45%** verbessert wurde.
- Implementierung robuster React-Architekturen mit TypeScript, Reduzierung von Laufzeitfehlern um **30%**.

### Softwareentwickler | InnovateWeb LLC
*2019 - 2022 | München, Deutschland*
- Entwicklung und Einführung von 4 hochfrequentierten Webanwendungen auf Basis von React und Node.js.
- Erstellung wiederverwendbarer UI-Komponenten zur Beschleunigung der Teameffizienz.

---

## Ausbildung

### B.Sc. Informatik | Technische Universität München
*2015 - 2019 | München, Deutschland*
- Abschluss mit Auszeichnung (Schnitt: 1,3).

---

## Fähigkeiten
- **Sprachen:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **Frameworks:** React, Next.js, Node.js, Express, TailwindCSS
- **Werkzeuge:** Git, AWS (S3, Lambda, RDS), Docker, GitHub Actions
`
  },
  it: {
    title: "Generatore CV da Markdown a PDF",
    editor: "Editor Markdown",
    preview: "Anteprima PDF in Tempo Reale",
    downloadPdf: "Stampa PDF",
    exportMarkdown: "Esporta MD",
    saveTemplate: "Salva Stili",
    loadTemplate: "Carica Stili",
    languageLabel: "Lingua",
    templateLabel: "Layout del CV",
    fontSizeControls: "Dimensioni Font Globali",
    elementStyles: "Personalizzazione Stili Markdown",
    fontSize: "Dimensione Font",
    color: "Colore",
    fontFamily: "Famiglia Font",
    bold: "Grassetto",
    italic: "Corsivo",
    classicCorporate: "Classico Aziendale (Serif)",
    creativeModern: "Creativo Moderno (Accent)",
    bodyText: "Corpo del Testo (p)",
    heading1: "Titolo 1 (h1)",
    heading2: "Titolo 2 (h2)",
    heading3: "Titolo 3 (h3)",
    heading4: "Titolo 4 (h4)",
    heading5: "Titolo 5 (h5)",
    heading6: "Titolo 6 (h6)",
    successSave: "Stili salvati nella memoria locale!",
    successLoad: "Stili caricati con successo!",
    noSavedData: "Nessuna configurazione di stile salvata trovata.",
    storageError: "Accesso alla memoria fallito o quota superata.",
    metaDescription: "Crea PDF di CV professionali A4 direttamente nel tuo browser usando Markdown. Personalizza tipografia, spazi e colori con anteprima istantanea.",
    saveResume: "Salva CV",
    savedResume: "Gespeicherter Lebenslauf",
    manageResumes: "Gestisci i CV Salvati",
    slotNamePlaceholder: "Nome del CV (es: Mio CV 2026)...",
    saveButton: "Salva nel Cookie",
    deleteButton: "Elimina",
    noResumesSaved: "Nessun CV salvato nei cookie.",
    presetThemes: "Temi Colore Predefiniti",
    boldConfig: "Configurazione grassetto (font-weight)",
    italicConfig: "Configurazione corsivo (font-style)",
    defaultLabel: "Predefinito",
    normalLabel: "Normale",
    customLabel: "Personalizzato",
    inheritLabel: "Eredita",
    defaultResume: `# Mario Rossi
**Sviluppatore Software Senior**  
📧 mario.rossi@email.it | 📱 +39 333 123 4567 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 Roma, Italia

---

## Profilo Professionale
Sviluppatore Software Senior appassionato e orientato ai dettagli con oltre 8 anni di esperienza nella progettazione di applicazioni web scalabili. Esperto in TypeScript, React e architetture cloud.

---

## Esperienza Professionale

### Sviluppatore Software Senior | TechCorp Inc.
*2022 - Presente | Roma, Italia*
- Coordinamento di un team di 5 ingegneri per ristrutturare la dashboard aziendale, velocizzando i caricamenti del **45%**.
- Implementazione di architetture React solide con TypeScript, abbassando i crash di runtime del **30%**.

### Sviluppatore Software | InnovateWeb LLC
*2019 - 2022 | Milano, Italia*
- Sviluppo e lancio di 4 applicazioni web ad alto traffico basate su React e Node.js.
- Creazione di una libreria di componenti UI riutilizzabili per velocizzare i rilasci.

---

## Istruzione

### Laurea Triennale in Informatica | Università di Roma La Sapienza
*2015 - 2019 | Roma, Italia*
- Laureato con Lode.

---

## Competenze
- **Linguaggi:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **Frameworks:** React, Next.js, Node.js, Express, TailwindCSS
- **Strumenti:** Git, AWS (S3, Lambda), Docker, GitHub Actions
`
  },
  es: {
    title: "Generador de CV de Markdown a PDF",
    editor: "Editor Markdown",
    preview: "Vista Previa PDF",
    downloadPdf: "Imprimir PDF",
    exportMarkdown: "Descargar MD",
    saveTemplate: "Guardar Estilos",
    loadTemplate: "Cargar Estilos",
    languageLabel: "Idioma",
    templateLabel: "Diseño del CV",
    fontSizeControls: "Tamaños de Fuente Globales",
    elementStyles: "Personalizar Estilos Markdown",
    fontSize: "Tamaño de Fuente",
    color: "Color",
    fontFamily: "Familia de Fuente",
    bold: "Negrita",
    italic: "Cursiva",
    classicCorporate: "Clásico Corporativo (Serif)",
    creativeModern: "Creativo Moderno (Accent)",
    bodyText: "Texto del Cuerpo (p)",
    heading1: "Título 1 (h1)",
    heading2: "Título 2 (h2)",
    heading3: "Título 3 (h3)",
    heading4: "Título 4 (h4)",
    heading5: "Título 5 (h5)",
    heading6: "Título 6 (h6)",
    successSave: "¡Estilos guardados en el almacenamiento local!",
    successLoad: "¡Estilos cargados con éxito!",
    noSavedData: "No se encontró configuración de estilo guardada.",
    storageError: "Fallo en el acceso al almacenamiento o cuota excedida.",
    metaDescription: "Cree PDF de CV profesionales A4 directamente en su navegador usando Markdown. Personalice fuentes, espacios y colores en tiempo real sin servidor.",
    saveResume: "Guardar CV",
    savedResume: "CV Salvati",
    manageResumes: "Gestionar CV Guardados",
    slotNamePlaceholder: "Nombre del CV (ej: Mi CV 2026)...",
    saveButton: "Guardar en Cookie",
    deleteButton: "Eliminar",
    noResumesSaved: "No se encontraron CV guardados en las cookies.",
    presetThemes: "Temas de Color Predefinidos",
    boldConfig: "Configuración de negrita (font-weight)",
    italicConfig: "Configuración de cursiva (font-style)",
    defaultLabel: "Predeterminado",
    normalLabel: "Normal",
    customLabel: "Personalizado",
    inheritLabel: "Heredar",
    defaultResume: `# Juan Pérez
**Ingeniero de Software Senior**  
📧 juan.perez@email.es | 📱 +34 600 123 456 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 Madrid, España

---

## Resumen Profesional
Ingeniero de Software Senior apasionado y detallista con más de 8 años de experiencia construyendo aplicaciones web escalables. Experto en TypeScript, React, Node.js y arquitecturas en la nube.

---

## Experiencia Profesional

### Ingeniero de Software Senior | TechCorp Inc.
*2022 - Presente | Madrid, España*
- Líder de un equipo de 5 ingenieros para rediseñar la plataforma de control empresarial, mejorando la velocidad de carga en un **45%**.
- Creación de arquitecturas React robustas con TypeScript, reduciendo errores en producción en un **30%**.

### Ingeniero de Software | InnovateWeb LLC
*2019 - 2022 | Barcelona, España*
- Desarrollo y lanzamiento de 4 aplicaciones web de alto tráfico utilizando React, Redux y Node.js.
- Creación de componentes UI modulares que aceleraron el desarrollo en 3 equipos internos.

---

## Educación

### Grado en Ingeniería Informática | Universidad Complutense de Madrid
*2015 - 2019 | Madrid, España*
- Graduado con Honores (GPA: 3.8/4.0).

---

## Habilidades
- **Lenguajes:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **Frameworks:** React, Next.js, Node.js, Express, TailwindCSS
- **Herramientas:** Git, AWS (S3, Lambda, RDS), Docker, GitHub Actions
`
  },
  pt: {
    title: "Gerador de Currículo Markdown para PDF",
    editor: "Editor Markdown",
    preview: "Visualização do PDF",
    downloadPdf: "Imprimir PDF",
    exportMarkdown: "Exportar MD",
    saveTemplate: "Gravar Estilos",
    loadTemplate: "Carregar Estilos",
    languageLabel: "Idioma",
    templateLabel: "Layout do Currículo",
    fontSizeControls: "Tamanhos de Letra Globais",
    elementStyles: "Personalização de Estilos Markdown",
    fontSize: "Tamanho da Letra",
    color: "Cor",
    fontFamily: "Família de Letras",
    bold: "Negrito",
    italic: "Itálico",
    classicCorporate: "Clássico Corporativo (Serif)",
    creativeModern: "Criativo Moderno (Accent)",
    bodyText: "Texto do Corpo (p)",
    heading1: "Título 1 (h1)",
    heading2: "Título 2 (h2)",
    heading3: "Título 3 (h3)",
    heading4: "Título 4 (h4)",
    heading5: "Título 5 (h5)",
    heading6: "Título 6 (h6)",
    successSave: "Estilos gravados no armazenamento local!",
    successLoad: "Estilos carregados com sucesso!",
    noSavedData: "Nenhuma configuração de estilo encontrada.",
    storageError: "Falha de acesso ao armazenamento ou cota excedida.",
    metaDescription: "Gere PDFs de currículo profissional A4 diretamente no seu browser usando Markdown. Customize tipografia e cores instantaneamente.",
    saveResume: "Gravar Currículo",
    savedResume: "CV Guardados",
    manageResumes: "Gerir Currículos Gravados",
    slotNamePlaceholder: "Nome do currículo (ex: Meu CV 2026)...",
    saveButton: "Gravar no Cookie",
    deleteButton: "Eliminar",
    noResumesSaved: "Nenhum currículo encontrado nos cookies.",
    presetThemes: "Temas de Cores Predefinidos",
    boldConfig: "Configuração de negrito (font-weight)",
    italicConfig: "Configuração de itálico (font-style)",
    defaultLabel: "Predefinido",
    normalLabel: "Normal",
    customLabel: "Personalizado",
    inheritLabel: "Herdar",
    defaultResume: `# João Silva
**Engenheiro de Software Sénior**  
📧 joao.silva@email.pt | 📱 +351 912 345 678 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 Lisboa, Portugal

---

## Resumo Profissional
Engenheiro de Software Sénior detalhista e apaixonado com mais de 8 anos de experiência na construção de aplicações web escaláveis. Especialista em TypeScript, React e infraestruturas em nuvem.

---

## Experiência Profissional

### Engenheiro de Software Sénior | TechCorp Inc.
*2022 - Presente | Lisboa, Portugal*
- Liderança de equipa de 5 engenheiros na reconstrução do portal operacional, reduzindo o tempo de carregamento em **45%**.
- Implementação de arquiteturas robustas em React e TypeScript, reduzindo falhas em produção em **30%**.

### Engenheiro de Software | InnovateWeb LLC
*2019 - 2022 | Porto, Portugal*
- Desenvolvimento e lançamento de 4 aplicações web de alto tráfego com React e Node.js.
- Arquitetura de biblioteca de componentes reutilizáveis compartilhada por 3 equipas de desenvolvimento.

---

## Educação

### Licenciatura em Engenharia Informática | Universidade de Lisboa
*2015 - 2019 | Lisboa, Portugal*
- Graduado com Distinção.

---

## Competências
- **Linguagens:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **Frameworks:** React, Next.js, Node.js, Express, TailwindCSS
- **Ferramentas:** Git, AWS (S3, Lambda), Docker, GitHub Actions
`
  },
  ja: {
    title: "MarkdownからPDF 履歴書ジェネレーター",
    editor: "Markdown エディタ",
    preview: "リアルタイムPDFプレビュー",
    downloadPdf: "PDFを印刷",
    exportMarkdown: "MDをエクスポート",
    saveTemplate: "スタイルを保存",
    loadTemplate: "スタイルを読み込む",
    languageLabel: "言語",
    templateLabel: "履歴書レイアウト",
    fontSizeControls: "全体フォントサイズ",
    elementStyles: "Markdownスタイル設定",
    fontSize: "フォントサイズ",
    color: "カラー",
    fontFamily: "フォントファミリー",
    bold: "太字",
    italic: "斜体",
    classicCorporate: "クラシック企業調 (明朝体)",
    creativeModern: "クリエイティブモダン (ゴシック)",
    bodyText: "本文 (p)",
    heading1: "見出し 1 (h1)",
    heading2: "見出し 2 (h2)",
    heading3: "見出し 3 (h3)",
    heading4: "見出し 4 (h4)",
    heading5: "見出し 5 (h5)",
    heading6: "見出し 6 (h6)",
    successSave: "スタイルをローカルストレージに保存しました！",
    successLoad: "スタイルを正常に読み込みました！",
    noSavedData: "保存されたスタイル設定が見つかりません。",
    storageError: "ストレージへのアクセスに失敗したか、容量の上限を超えました。",
    metaDescription: "ブラウザ内でMarkdownを使って、A4サイズの高品位なPDF履歴書を生成。レイアウトの変更、配色やフォントのカスタマイズが可能です。",
    saveResume: "履歴書を保存",
    savedResume: "Currículos Salvos",
    manageResumes: "保存された履歴書の管理",
    slotNamePlaceholder: "履歴書の名前（例：日本語履歴書2026）...",
    saveButton: "Cookieに保存",
    deleteButton: "削除",
    noResumesSaved: "Cookieに保存された履歴書が見つかりません。",
    presetThemes: "プリセット配色テーマ",
    boldConfig: "太字設定 (font-weight)",
    italicConfig: "斜体設定 (font-style)",
    defaultLabel: "デフォルト",
    normalLabel: "標準",
    customLabel: "カスタム",
    inheritLabel: "継承",
    defaultResume: `# 田中 太郎
**シニアソフトウェアエンジニア**  
📧 taro.tanaka@email.jp | 📱 +81 90-1234-5678 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 東京都港区

---

## 職務要約
スケーラブルなWebアプリケーションの開発において8年以上の実績を持つ、ディテール志向のシニアソフトウェアエンジニア。TypeScript、React、Node.js、およびクラウドアーキテクチャの専門知識を有します。

---

## 職務経歴

### シニアソフトウェアエンジニア | 株式会社テックコープ
*2022年 - 現在 | 東京都*
- 5名のエンジニアチームを率いて基幹ダッシュボードを再構築し、画面ロード時間を **45%** 高速化。
- TypeScriptを用いた堅牢なReactフロントエンド設計を導入し、ランタイムエラーを **30%** 低減。

### ソフトウェアエンジニア | イノベートウェブ合同会社
*2019年 - 2022年 | 大阪府*
- ReactとNode.jsを駆使し、トラフィックの多い4つのWebアプリを開発しローンチ。
- 共有UIコンポーネントライブラリの作成を主導し、複数の社内プロジェクトの開発スピードを向上。

---

## 学歴

### 工学部情報工学科 卒業 | 東京大学
*2015年 - 2019年 | 東京都*
- 優秀卒業生（GPA: 3.8/4.0）。

---

## スキル
- **開発言語:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **フレームワーク:** React, Next.js, Node.js, Express, TailwindCSS
- **ツール・インフラ:** Git, AWS (S3, Lambda, RDS), Docker, GitHub Actions
`
  },
  ko: {
    title: "Markdown PDF 이력서 생성기",
    editor: "Markdown 편집기",
    preview: "실시간 PDF 미리보기",
    downloadPdf: "PDF 인쇄",
    exportMarkdown: "MD 내보내기",
    saveTemplate: "스타일 저장",
    loadTemplate: "스타일 로드",
    languageLabel: "언어",
    templateLabel: "이력서 레이아웃",
    fontSizeControls: "글꼴 크기 조절",
    elementStyles: "Markdown 스타일 재설정",
    fontSize: "글꼴 크기",
    color: "색상",
    fontFamily: "글꼴",
    bold: "굵게",
    italic: "기울임",
    classicCorporate: "클래식 기업형 (바탕체)",
    creativeModern: "크리에이티브 모던 (돋움체)",
    bodyText: "본문 (p)",
    heading1: "제목 1 (h1)",
    heading2: "제목 2 (h2)",
    heading3: "제목 3 (h3)",
    heading4: "제목 4 (h4)",
    heading5: "제목 5 (h5)",
    heading6: "제목 6 (h6)",
    successSave: "스타일이 로컬 스토리지에 저장되었습니다!",
    successLoad: "스타일을 성공적으로 불러왔습니다!",
    noSavedData: "저장된 스타일 설정을 찾을 수 없습니다.",
    storageError: "저장소에 접근할 수 없거나 용량 한도를 초과했습니다.",
    metaDescription: "서버 전송 없이 브라우저 내에서 마크다운을 통해 고품질 이력서 PDF를 실시간 템플릿과 정밀 배치 제어로 생성하세요.",
    saveResume: "이력서 저장",
    savedResume: "保存された履歴書",
    manageResumes: "저장된 이력서 관리",
    slotNamePlaceholder: "이력서 이름 입력 (예: 국문 이력서 2026)...",
    saveButton: "Cookie에 저장",
    deleteButton: "삭제",
    noResumesSaved: "Cookie에 저장된 이력서가 없습니다.",
    presetThemes: "추천 색상 테마",
    boldConfig: "굵기 설정 (font-weight)",
    italicConfig: "기울임 설정 (font-style)",
    defaultLabel: "기본값",
    normalLabel: "보통",
    customLabel: "사용자정의",
    inheritLabel: "상속",
    defaultResume: `# 김철수
**시니어 소프트웨어 엔지니어**  
📧 chulsoo.kim@email.kr | 📱 +82 10-1234-5678 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 대한민국 서울

---

## 기술 요약
스케일링 가능한 웹 애플리케이션 개발에 8년 이상의 경력을 가진 시니어 소프트웨어 엔지니어입니다. TypeScript, React, Node.js 및 클라우드 아키텍처에 강점을 가지고 있습니다.

---

## 경력 사항

### 시니어 소프트웨어 엔지니어 | (주)테크코프
*2022년 - 현재 | 서울*
- 5인 규모의 개발팀을 이끌어 기업 대시보드를 전면 재구축하여 로딩 속도 **45%** 개선.
- TypeScript 기반의 견고한 React 아키텍처를 수립하여 런타임 오류율 **30%** 감소.

### 소프트웨어 엔지니어 | 이노베이트웹
*2019년 - 2022년 | 부산*
- React 및 Node.js 기반의 고트래픽 웹 애플리케이션 4개 런칭 및 운영.
- 공통 UI 컴포넌트 라이브러리 설계를 구축하여 사내 프로젝트들의 개발 속도 증진.

---

## 학력 사항

### 컴퓨터공학 학사 | 서울대학교
*2015년 - 2019년 | 서울*
- 우수 졸업 (평점: 3.8/4.0).

---

## 기술 스택
- **언어:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **프레임워크:** React, Next.js, Node.js, Express, TailwindCSS
- **도구 및 인프라:** Git, AWS (S3, Lambda, RDS), Docker, GitHub Actions
`
  },
  ru: {
    title: "Генератор резюме из Markdown в PDF",
    editor: "Редактор Markdown",
    preview: "Предпросмотр PDF",
    downloadPdf: "Печать PDF",
    exportMarkdown: "Экспорт MD",
    saveTemplate: "Сохранить стили",
    loadTemplate: "Загрузить стили",
    languageLabel: "Язык",
    templateLabel: "Шаблон резюме",
    fontSizeControls: "Глобальные размеры шрифтов",
    elementStyles: "Настройка стилей Markdown",
    fontSize: "Размер шрифта",
    color: "Цвет",
    fontFamily: "Семейство шрифтов",
    bold: "Полужирный",
    italic: "Курсив",
    classicCorporate: "Классический корпоративный (Засечки)",
    creativeModern: "Креативный современный (Акцент)",
    bodyText: "Основной текст (p)",
    heading1: "Заголовок 1 (h1)",
    heading2: "Заголовок 2 (h2)",
    heading3: "Заголовок 3 (h3)",
    heading4: "Заголовок 4 (h4)",
    heading5: "Заголовок 5 (h5)",
    heading6: "Заголовок 6 (h6)",
    successSave: "Стили сохранены в локальное хранилище !",
    successLoad: "Стили успешно загружены !",
    noSavedData: "Сохраненные конфигурации стилей не найдены.",
    storageError: "Ошибка доступа к хранилищу или превышен лимит.",
    metaDescription: "Создавайте профессиональные резюме в формате A4 PDF прямо в браузере с помощью Markdown. Настраивайте шрифты, отступы и цвета в режиме реального времени.",
    saveResume: "Сохранить резюме",
    savedResume: "저장된 이력서",
    manageResumes: "Управление резюме",
    slotNamePlaceholder: "Название резюме (например: Мое резюме 2026)...",
    saveButton: "Сохранить в Cookie",
    deleteButton: "Удалить",
    noResumesSaved: "Сохраненные резюме в cookies не найдены.",
    presetThemes: "Предустановленные цветовые схемы",
    boldConfig: "Настройка начертания (font-weight)",
    italicConfig: "Настройка курсива (font-style)",
    defaultLabel: "По умолчанию",
    normalLabel: "Обычный",
    customLabel: "Свой цвет",
    inheritLabel: "Наследовать",
    defaultResume: `# Иван Иванов
**Старший разработчик программного обеспечения**  
📧 ivan.ivanov@email.ru | 📱 +7 (999) 123-45-67 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 Москва, Россия

---

## Профессиональный опыт
Целеустремленный старший разработчик ПО с более чем 8-летним опытом проектирования высоконагруженных веб-приложений. Эксперт в TypeScript, React, Node.js и облачных технологиях.

---

## Опыт работы

### Старший разработчик ПО | ТехКорп
*2022 - н. в. | Москва, Россия*
- Руководил командой из 5 инженеров по редизайну портала компании, снизив время загрузки страниц на **45%**.
- Внедрил стандарты React-разработки на TypeScript, снизив количество багов в продакшене на **30%**.

### Разработчик ПО | Инновэйт Веб
*2019 - 2022 | Санкт-Петербург, Россия*
- Разработал и запустил 4 веб-приложения с высокой посещаемостью на React и Node.js.
- Создал модульную библиотеку UI-компонентов, увеличив скорость разработки в 3 командах.

---

## Образование

### Бакалавр компьютерных наук | МГУ им. Ломоносова
*2015 - 2019 | Москва, Россия*
- Окончил с отличием (средний балл: 4.8/5.0).

---

## Ключевые навыки
- **Языки:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **Фреймворки:** React, Next.js, Node.js, Express, TailwindCSS
- **Инструменты:** Git, AWS (S3, Lambda), Docker, GitHub Actions
`
  },
  "zh-tw": {
    title: "Markdown 轉 PDF 履歷生成器",
    editor: "Markdown 編輯器",
    preview: "即時 PDF 預覽",
    downloadPdf: "列印 PDF",
    exportMarkdown: "匯出 MD",
    saveTemplate: "儲存樣式",
    loadTemplate: "載入樣式",
    languageLabel: "語言",
    templateLabel: "履歷範本",
    fontSizeControls: "全域字型大小",
    elementStyles: "Markdown 元素樣式細調",
    fontSize: "字型大小",
    color: "顏色",
    fontFamily: "字型系列",
    bold: "粗體",
    italic: "斜體",
    classicCorporate: "經典行政 (經典)",
    creativeModern: "創意現代 (側欄)",
    bodyText: "本文 (p)",
    heading1: "標題 1 (h1)",
    heading2: "標題 2 (h2)",
    heading3: "標題 3 (h3)",
    heading4: "標題 4 (h4)",
    heading5: "標題 5 (h5)",
    heading6: "標題 6 (h6)",
    successSave: "樣式已成功儲存至本機！",
    successLoad: "樣式載入成功！",
    noSavedData: "未找到已儲存的樣式設定。",
    storageError: "儲存空間存取失敗或容量已滿。",
    metaDescription: "在瀏覽器中直接使用 Markdown 建立專業的 A4 PDF 履歷。即時調整字型、邊距與顏色。",
    saveResume: "儲存履歷",
    savedResume: "Сохраненные резюме",
    manageResumes: "管理履歷",
    slotNamePlaceholder: "履歷名稱（例如：我的履歷 2026）...",
    saveButton: "儲存至本機",
    deleteButton: "刪除",
    noResumesSaved: "未找到已儲存的履歷。",
    presetThemes: "內建色彩配置",
    boldConfig: "字型粗細設定",
    italicConfig: "斜體設定",
    defaultLabel: "預設",
    normalLabel: "常規",
    customLabel: "自訂顏色",
    inheritLabel: "繼承",
    defaultResume: `# 張三
**高級軟體工程師**  
📧 zhangsan@email.com | 📱 +886 912 345 678 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 台北市

---

## 專業總結
具備 8 年以上高負載 Web 應用程式開發經驗的高級軟體工程師。精通 TypeScript、React、Node.js 與雲端架構。

---

## 工作經歷

### 高級軟體工程師 | 科創科技股份有限公司
*2022 - 至今 | 台北市，台灣*
- 帶領 5 人研發小組重構企業核心後台，使頁面載入時間縮短 **45%**。
- 制定 TypeScript 與 React 開發規範，使線上故障率降低 **30%**。

### 軟體工程師 | 創聯網路服務有限公司
*2019 - 2022 | 新北市，台灣*
- 使用 React 與 Node.js 開發並發布了 4 款高流量的 Web 應用程式。
- 構建了模組化的內部 UI 組件庫，使 3 個業務團隊的開發效率提升。

---

## 教育背景

### 資訊工程學士 | 國立台灣大學
*2015 - 2019 | 台北市，台灣*
- 畢業成績優異 (GPA: 4.0/4.0)。

---

## 專業技能
- **程式語言:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **框架與庫:** React, Next.js, Node.js, Express, TailwindCSS
- **工具:** Git, AWS (S3, Lambda), Docker, GitHub Actions
`
  },
  uk: {
    title: "Генератор резюме з Markdown в PDF",
    editor: "Редактор Markdown",
    preview: "Попередній перегляд PDF",
    downloadPdf: "Друкувати PDF",
    exportMarkdown: "Експорт MD",
    saveTemplate: "Зберегти стилі",
    loadTemplate: "Завантажити стилі",
    languageLabel: "Мова",
    templateLabel: "Шаблон резюме",
    fontSizeControls: "Глобальні розміри шрифтів",
    elementStyles: "Налаштування стилів Markdown",
    fontSize: "Розмір шрифту",
    color: "Колір",
    fontFamily: "Сімейство шрифтів",
    bold: "Напівжирний",
    italic: "Курсив",
    classicCorporate: "Класичний корпоративний (Засічки)",
    creativeModern: "Креативний сучасний (Акцент)",
    bodyText: "Основний текст (p)",
    heading1: "Заголовок 1 (h1)",
    heading2: "Заголовок 2 (h2)",
    heading3: "Заголовок 3 (h3)",
    heading4: "Заголовок 4 (h4)",
    heading5: "Заголовок 5 (h5)",
    heading6: "Заголовок 6 (h6)",
    successSave: "Стили збережено в локальне сховище !",
    successLoad: "Стили успішно завантажено !",
    noSavedData: "Збережених конфігурацій стилів не знайдено.",
    storageError: "Помилка доступу до сховища або перевищено ліміт.",
    metaDescription: "Створюйте професійні резюме у форматі A4 PDF прямо у браузері за допомогою Markdown. Налаштовуйте шрифти, відступи та кольори в режимі реального часу.",
    saveResume: "Зберегти резюме",
    savedResume: "Збережені резюме",
    manageResumes: "Керування резюме",
    slotNamePlaceholder: "Назва резюме (наприклад: Моє резюме 2026)...",
    saveButton: "Зберегти в Cookie",
    deleteButton: "Видалити",
    noResumesSaved: "Збережених резюме в cookies не знайдено.",
    presetThemes: "Вбудовані колірні схеми",
    boldConfig: "Налаштування товщини (font-weight)",
    italicConfig: "Налаштування курсиву (font-style)",
    defaultLabel: "За замовчуванням",
    normalLabel: "Звичайний",
    customLabel: "Свій колір",
    inheritLabel: "Успадкувати",
    defaultResume: `# Олександр Коваленко
**Старший розробник програмного забезпечення**  
📧 o.kovalenko@email.ua | 📱 +380 50 123 4567 

🌐 [github.com/victor-go](https://github.com/victor-go) | 📍 Київ, Україна

---

## Професійний підсумок
Старший розробник програмного забезпечення з більш ніж 8-річним досвідом проектування масштабованих веб-додатків. Експерт у TypeScript, React, Node.js та хмарних архітектурах.

---

## Досвід роботи

### Старший розробник ПЗ | ТехКорп
*2022 - н. ч. | Київ, Україна*
- Керував командою з 5 інженерів з перепроектування корпоративного порталу, знизивши час завантаження на **45%**.
- Впровадив надійні аспекти розробки React на TypeScript, знизивши кількість помилок у продакшені на **30%**.

### Розробник ПЗ | Інновейт Веб
*2019 - 2022 | Львів, Україна*
- Розробив та запустив 4 веб-додатки з великим трафіком на React та Node.js.
- Створив модульну бібліотеку UI-компонентів, прискоривши розробку в 3 внутрішніх командах.

---

## Освіта

### Бакалавр комп'ютерних наук | Київський національний університет імені Тараса Шевченка
*2015 - 2019 | Київ, Україна*
- Закінчив з відзнакою (GPA: 4.8/5.0).

---

## Ключові навички
- **Мови:** TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- **Фреймворки:** React, Next.js, Node.js, Express, TailwindCSS
- **Інструменти:** Git, AWS (S3, Lambda), Docker, GitHub Actions
`
  }
};

export interface ExtraTranslations {
  deleteConfirm: string;
  deletedToast: string;
  clickToLoad: string;
  backupSectionTitle: string;
  nameRequired: string;
  loadSuccess: string;
  resetConfirm: string;
  resetSuccess: string;
  pdfGeneratingToast: string;
  pdfSuccess: string;
  pdfError: string;
  mdSuccess: string;
  mdError: string;
  pageBreakTip: string;
  showPanel: string;
  hidePanel: string;
  overallTab: string;
  bodyTab: string;
  boldTab: string;
  italicTab: string;
  layoutClassic: string;
  layoutCreative: string;
  layoutMinimalist: string;
  layoutDeveloper: string;
  layoutAcademic: string;
  layoutPortfolio: string;
  layoutCompact: string;
  layoutEditorial: string;
  layoutModernist: string;
  layoutExecutive: string;
  layoutTech: string;
  layoutVintage: string;
  layoutGrid: string;
  layoutClean: string;
  layoutBold: string;
  layoutStylish: string;
  layoutHybrid: string;
  themeRoyalSapphire: string;
  themeEmeraldForest: string;
  themeBurgundyExecutive: string;
  themeCharcoalModern: string;
  themeSunsetBronze: string;
  themeMidnightPurple: string;
  themeOceanTeal: string;
  themeWarmTerracotta: string;
  themeRoseGold: string;
  themeLavenderFields: string;
  themeSlateSteel: string;
  themeForestMoss: string;
  themeNeonCyberpunk: string;
  themeVibrantTangerine: string;
  themeElectricViolet: string;
  themeVibrantCrimson: string;
  themeSolarGold: string;
  themeVividLime: string;
  themeMidnightNavy: string;
  themeForestSage: string;
  themeCrimsonVelvet: string;
  themeCopperAutumn: string;
  themeTealMinimalist: string;
  themePlumLuxury: string;
  overwriteConfirm: string;
  stylesTitle: string;
  resetTooltip: string;
  metaTitleSuffix: string;
  githubStarText: string;
  linkTab: string;
}

export const extraTranslations: Record<string, ExtraTranslations> = {
  en: {
    deleteConfirm: "Are you sure you want to delete this resume? This cannot be undone.",
    deletedToast: "Resume deleted",
    clickToLoad: "Click to load",
    backupSectionTitle: "Backup Current Resume & Styles",
    nameRequired: "Please enter a resume name",
    loadSuccess: "Resume and styles loaded!",
    resetConfirm: "Are you sure you want to reset all custom styles? This will restore the template default colors and typography.",
    resetSuccess: "Styles reset to defaults",
    pdfGeneratingToast: "Generating PDF, please wait...",
    pdfSuccess: "PDF exported successfully!",
    pdfError: "PDF generation failed, please try again.",
    mdSuccess: "Markdown exported successfully!",
    mdError: "Export failed",
    pageBreakTip: "Tip: Logical use of Section (##) and Sub-items (###) automatically avoids page-break splitting.",
    showPanel: "Show Panel",
    hidePanel: "Hide Panel",
    overallTab: "Overall",
    bodyTab: "Body",
    boldTab: "Bold",
    italicTab: "Italic",
    layoutClassic: "Classic Corporate (Traditional)",
    layoutCreative: "Creative Modern (Accent Sidebar)",
    layoutMinimalist: "Minimalist Clean (Spacious)",
    layoutDeveloper: "Developer Tech (Monospace)",
    layoutAcademic: "Academic CV (Formal Serif)",
    layoutPortfolio: "Bold Portfolio (Artistic)",
    layoutCompact: "Dense Compact (One Page)",
    layoutEditorial: "Editorial",
    layoutModernist: "Modern Clean (Top Border Accent)",
    layoutExecutive: "Elegant Executive (Color Header)",
    layoutTech: "Advanced Tech (Divided Sections)",
    layoutVintage: "Vintage Book (Warm Serif)",
    layoutGrid: "Grid Portfolio (Structured Columns)",
    layoutClean: "Clean Minimalist (Airy Whitespace)",
    layoutBold: "Bold High-Contrast (Solid Accent Header)",
    layoutStylish: "Stylish Accent (Vibrant Details)",
    layoutHybrid: "Hybrid Sidebar (Split Columns)",
    themeRoyalSapphire: "Royal Sapphire",
    themeEmeraldForest: "Emerald Forest",
    themeBurgundyExecutive: "Burgundy Executive",
    themeCharcoalModern: "Charcoal Modern",
    themeSunsetBronze: "Sunset Bronze",
    themeMidnightPurple: "Midnight Purple",
    themeOceanTeal: "Ocean Teal",
    themeWarmTerracotta: "Warm Terracotta",
    themeRoseGold: "Rose Gold",
    themeLavenderFields: "Lavender Fields",
    themeSlateSteel: "Slate Steel",
    themeForestMoss: "Forest Moss",
    themeNeonCyberpunk: "Neon Cyberpunk",
    themeVibrantTangerine: "Vibrant Tangerine",
    themeElectricViolet: "Electric Violet",
    themeVibrantCrimson: "Vibrant Crimson",
    themeSolarGold: "Solar Gold",
    themeVividLime: "Vivid Lime",
    themeMidnightNavy: "Midnight Navy",
    themeForestSage: "Forest Sage",
    themeCrimsonVelvet: "Crimson Velvet",
    themeCopperAutumn: "Copper Autumn",
    themeTealMinimalist: "Teal Minimalist",
    themePlumLuxury: "Plum Luxury",
    overwriteConfirm: "A saved resume with this name already exists. Do you want to overwrite it?",
    stylesTitle: "Styles Configuration",
    resetTooltip: "Reset all styles",
    metaTitleSuffix: "Design A4 Resumes Client-Side",
    githubStarText: "If you find this project helpful, please consider giving it a star on GitHub! ⭐",
    linkTab: "Link"
  },
  zh: {
    deleteConfirm: "确定要删除此简历备份吗？此操作无法撤销。",
    deletedToast: "简历已删除",
    clickToLoad: "点击载入",
    backupSectionTitle: "备份当前简历与样式",
    nameRequired: "请输入简历名称",
    loadSuccess: "已加载所选简历及样式",
    resetConfirm: "确定要重置所有自定样式吗？此操作将恢复模板的默认排版与颜色。",
    resetSuccess: "样式已重置为默认值",
    pdfGeneratingToast: "正在生成 PDF，请稍候...",
    pdfSuccess: "PDF 导出成功！",
    pdfError: "PDF 生成失败，请重试。",
    mdSuccess: "Markdown 导出成功！",
    mdError: "导出失败",
    pageBreakTip: "提示：合理使用二级标题(##)和三级标题(###)可以自动避免内容在PDF分页处被截断。",
    showPanel: "显示面板",
    hidePanel: "隐藏面板",
    overallTab: "全局",
    bodyTab: "正文",
    boldTab: "粗体",
    italicTab: "斜体",
    layoutClassic: "经典行政 (经典)",
    layoutCreative: "创意现代 (侧栏)",
    layoutMinimalist: "极简干净 (留白)",
    layoutDeveloper: "开发技术 (等宽)",
    layoutAcademic: "学术履历 (传统衬线)",
    layoutPortfolio: "个性作品集 (艺术粗体)",
    layoutCompact: "紧凑高密 (单页推荐)",
    layoutEditorial: "Editorial",
    layoutModernist: "现代清洁 (顶部饰条)",
    layoutExecutive: "优雅行政 (彩色页眉)",
    layoutTech: "前沿技术 (分区格线)",
    layoutVintage: "复古文艺 (温润衬线)",
    layoutGrid: "网格排版 (结构对齐)",
    layoutClean: "极简轻盈 (呼吸留白)",
    layoutBold: "高对比粗犷 (深色页眉)",
    layoutStylish: "风尚艺术 (灵动细节)",
    layoutHybrid: "混合双栏 (侧边信息)",
    themeRoyalSapphire: "皇家蓝宝石",
    themeEmeraldForest: "翡翠森林",
    themeBurgundyExecutive: "勃艮第行政",
    themeCharcoalModern: "现代炭黑",
    themeSunsetBronze: "落日青铜",
    themeMidnightPurple: "午夜深紫",
    themeOceanTeal: "海洋深绿",
    themeWarmTerracotta: "温暖陶土",
    themeRoseGold: "玫瑰金",
    themeLavenderFields: "薰衣草田",
    themeSlateSteel: "板岩钢灰",
    themeForestMoss: "森林苔藓",
    themeNeonCyberpunk: "霓虹赛博",
    themeVibrantTangerine: "活力蜜橘",
    themeElectricViolet: "极光野紫",
    themeVibrantCrimson: "狂耀猩红",
    themeSolarGold: "曜日烈金",
    themeVividLime: "极速耀绿",
    themeMidnightNavy: "极夜深蓝",
    themeForestSage: "雅致鼠尾草",
    themeCrimsonVelvet: "丝绒绯红",
    themeCopperAutumn: "金秋红铜",
    themeTealMinimalist: "极简青黛",
    themePlumLuxury: "尊贵奢华梅",
    overwriteConfirm: "已存在同名存档，是否要覆盖它？",
    stylesTitle: "样式配置",
    resetTooltip: "重置所有样式",
    metaTitleSuffix: "专业 Markdown 简历排版生成器",
    githubStarText: "如果您觉得本项目有帮助，请在 GitHub 上点个 Star 支持一下！⭐",
    linkTab: "链接"
  },
  fr: {
    deleteConfirm: "Voulez-vous vraiment supprimer ce CV ? Cette opération est irréversible.",
    deletedToast: "CV supprimé",
    clickToLoad: "Cliquez pour charger",
    backupSectionTitle: "Sauvegarder le CV et les styles actuels",
    nameRequired: "Veuillez entrer un nom pour le CV",
    loadSuccess: "CV et styles chargés !",
    resetConfirm: "Voulez-vous vraiment réinitialiser tous les styles personnalisés ? Cela restaurera les couleurs et la typographie par défaut du modèle.",
    resetSuccess: "Styles réinitialisés aux valeurs par défaut",
    pdfGeneratingToast: "Génération du PDF, veuillez patienter...",
    pdfSuccess: "PDF exporté avec succès !",
    pdfError: "Échec de la génération du PDF, veuillez réessayer.",
    mdSuccess: "Markdown exporté avec succès !",
    mdError: "Échec de l'exportation",
    pageBreakTip: "Astuce : L'utilisation logique des sections (##) et sous-sections (###) évite les coupures de page accidentelles.",
    showPanel: "Afficher le panneau",
    hidePanel: "Masquer le panneau",
    overallTab: "Général",
    bodyTab: "Corps",
    boldTab: "Gras",
    italicTab: "Italique",
    layoutClassic: "Entreprise Classique",
    layoutCreative: "Moderne Créatif",
    layoutMinimalist: "Épuré Minimaliste",
    layoutDeveloper: "Tech Développeur",
    layoutAcademic: "CV Académique",
    layoutPortfolio: "Portfolio Audacieux",
    layoutCompact: "Compact Dense",
    layoutEditorial: "Editorial",
    layoutModernist: "Moderne Propre",
    layoutExecutive: "Exécutif Élégant",
    layoutTech: "Technologie Avancée",
    layoutVintage: "Littéraire Vintage",
    layoutGrid: "Grille de Portfolio",
    layoutClean: "Minimaliste Pur",
    layoutBold: "Haut Contraste",
    layoutStylish: "Créatif Élégant",
    layoutHybrid: "Sidebar Hybride",
    themeRoyalSapphire: "Saphir Royal",
    themeEmeraldForest: "Forêt d'Émeraude",
    themeBurgundyExecutive: "Bourgogne Exécutif",
    themeCharcoalModern: "Anthracite Moderne",
    themeSunsetBronze: "Bronze du Coucher de Soleil",
    themeMidnightPurple: "Pourpre de Minuit",
    themeOceanTeal: "Sarcelle de l'Océan",
    themeWarmTerracotta: "Terre Cuite Chaude",
    themeRoseGold: "Or Rose",
    themeLavenderFields: "Champs de Lavande",
    themeSlateSteel: "Acier Ardoise",
    themeForestMoss: "Mousse de Forêt",
    themeNeonCyberpunk: "Cyberpunk Néon",
    themeVibrantTangerine: "Mandarine Vibrante",
    themeElectricViolet: "Violet Électrique",
    themeVibrantCrimson: "Cramoisi Vibrant",
    themeSolarGold: "Or Solaire",
    themeVividLime: "Chaux Vive",
    themeMidnightNavy: "Marine de Minuit",
    themeForestSage: "Sauge des Bois",
    themeCrimsonVelvet: "Velours Cramoisi",
    themeCopperAutumn: "Automne Cuivré",
    themeTealMinimalist: "Sarcelle Minimaliste",
    themePlumLuxury: "Prune de Luxe",
    overwriteConfirm: "已存在同名备份，是否要覆盖它？",
    stylesTitle: "样式配置",
    resetTooltip: "重置所有样式",
    metaTitleSuffix: "专业 Markdown 简历排版生成器",
    githubStarText: "Si vous trouvez ce projet utile, n'hésitez pas à lui attribuer une étoile sur GitHub ! ⭐",
    linkTab: "Lien"
  },
  de: {
    deleteConfirm: "Sind Sie sicher, dass Sie diesen Lebenslauf löschen möchten? Dies kann nicht rückgängig gemacht werden.",
    deletedToast: "Lebenslauf gelöscht",
    clickToLoad: "Zum Laden klicken",
    backupSectionTitle: "Aktuellen Lebenslauf & Stile sichern",
    nameRequired: "Bitte geben Sie einen Namen für den Lebenslauf ein",
    loadSuccess: "Lebenslauf und Stile geladen!",
    resetConfirm: "Sind Sie sicher, dass Sie alle benutzerdefinierten Stile zurücksetzen möchten? Dadurch werden die Standardfarben und -typografien der Vorlage wiederhergestellt.",
    resetSuccess: "Stile auf Standardwerte zurückgesetzt",
    pdfGeneratingToast: "PDF wird erstellt, bitte warten...",
    pdfSuccess: "PDF erfolgreich exportiert!",
    pdfError: "PDF-Erstellung fehlgeschlagen, bitte versuchen Sie es erneut.",
    mdSuccess: "Markdown erfolgreich exportiert!",
    mdError: "Export fehlgeschlagen",
    pageBreakTip: "Tipp: Die logische Verwendung von Abschnitten (##) und Unterabschnitten (###) verhindert unschöne Seitenumbrüche.",
    showPanel: "Panel anzeigen",
    hidePanel: "Panel ausblenden",
    overallTab: "Allgemein",
    bodyTab: "Textkörper",
    boldTab: "Fett",
    italicTab: "Kursiv",
    layoutClassic: "Klassisch Corporate",
    layoutCreative: "Kreativ Modern",
    layoutMinimalist: "Minimalistisch Sauber",
    layoutDeveloper: "Entwickler Tech",
    layoutAcademic: "Akademischer Lebenslauf",
    layoutPortfolio: "Kühnes Portfolio",
    layoutCompact: "Kompakt Dicht",
    layoutEditorial: "Editorial",
    layoutModernist: "Modern Sauber",
    layoutExecutive: "Eleganter Vorstand",
    layoutTech: "Erweiterte Tech",
    layoutVintage: "Klassisch Vintage",
    layoutGrid: "Portfolio Raster",
    layoutClean: "Klarer Minimalismus",
    layoutBold: "Starker Kontrast",
    layoutStylish: "Stilvolle Akzente",
    layoutHybrid: "Hybrid-Spalten",
    themeRoyalSapphire: "Königssaphir",
    themeEmeraldForest: "Smaragdwald",
    themeBurgundyExecutive: "Burgunder Executive",
    themeCharcoalModern: "Holzkohle Modern",
    themeSunsetBronze: "Sonnenuntergangsbronze",
    themeMidnightPurple: "Mitternachtspurpur",
    themeOceanTeal: "Ozean-Teal",
    themeWarmTerracotta: "Warme Terrakotta",
    themeRoseGold: "Roségold",
    themeLavenderFields: "Lavendelfelder",
    themeSlateSteel: "Schieferstahl",
    themeForestMoss: "Waldmoos",
    themeNeonCyberpunk: "Neon Cyberpunk",
    themeVibrantTangerine: "Kräftige Mandarine",
    themeElectricViolet: "Elektrisches Violett",
    themeVibrantCrimson: "Kräftiges Karmesin",
    themeSolarGold: "Sonnengold",
    themeVividLime: "Lebendiges Limettengrün",
    themeMidnightNavy: "Mitternachtsblau",
    themeForestSage: "Waldsalbei",
    themeCrimsonVelvet: "Purpurroter Samt",
    themeCopperAutumn: "Kupferner Herbst",
    themeTealMinimalist: "Teal-Minimalistisch",
    themePlumLuxury: "Luxuriöses Pflaumenlila",
    overwriteConfirm: "已存在同名备份，是否要覆盖它？",
    stylesTitle: "Stil-Konfiguration",
    resetTooltip: "Alle Stile zurücksetzen",
    metaTitleSuffix: "Professioneller Markdown-Lebenslauf-Generator",
    githubStarText: "Wenn Sie dieses Projekt nützlich finden, geben Sie ihm bitte einen Stern auf GitHub! ⭐",
    linkTab: "Link"
  },
  it: {
    deleteConfirm: "Sei sicuro di voler eliminare questo curriculum? L'azione non può essere annullata.",
    deletedToast: "Curriculum eliminato",
    clickToLoad: "Clicca per caricare",
    backupSectionTitle: "Salva curriculum e stili attuali",
    nameRequired: "Inserisci un nome per il curriculum",
    loadSuccess: "Curriculum e stili caricati!",
    resetConfirm: "Sei sicuro di voler ripristinare tutti gli stili personalizzati? Verranno ripristinati i colori e la tipografia predefiniti del modello.",
    resetSuccess: "Stili ripristinati ai valori predefiniti",
    pdfGeneratingToast: "Generazione del PDF in corso, attendere...",
    pdfSuccess: "PDF esportato con successo!",
    pdfError: "Generazione PDF fallita, riprova.",
    mdSuccess: "Markdown esportato con successo!",
    mdError: "Esportazione fallita",
    pageBreakTip: "Suggerimento: L'uso logico di sezioni (##) e sottosezioni (###) evita interruzioni di pagina indesiderate.",
    showPanel: "Mostra pannello",
    hidePanel: "Nascondi pannello",
    overallTab: "Generale",
    bodyTab: "Corpo",
    boldTab: "Grassetto",
    italicTab: "Corsivo",
    layoutClassic: "Classico Aziendale",
    layoutCreative: "Creativo Moderno",
    layoutMinimalist: "Minimalista Pulito",
    layoutDeveloper: "Tecnologico Sviluppatore",
    layoutAcademic: "Curriculum Accademico",
    layoutPortfolio: "Portfolio Audace",
    layoutCompact: "Compatto Denso",
    layoutEditorial: "Editorial",
    layoutModernist: "Moderno Pulito",
    layoutExecutive: "Esecutivo Elegante",
    layoutTech: "Tech Avanzato",
    layoutVintage: "Classico Vintage",
    layoutGrid: "Griglia Portfolio",
    layoutClean: "Minimalista Puro",
    layoutBold: "Forte Contrasto",
    layoutStylish: "Dettagli di Stile",
    layoutHybrid: "Colonne Ibride",
    themeRoyalSapphire: "Zaffiro Reale",
    themeEmeraldForest: "Foresta di Smeraldo",
    themeBurgundyExecutive: "Borgogna Executive",
    themeCharcoalModern: "Carbonio Moderno",
    themeSunsetBronze: "Bronzo Tramonto",
    themeMidnightPurple: "Viola Mezzanotte",
    themeOceanTeal: "Verde Oceano",
    themeWarmTerracotta: "Terracotta Calda",
    themeRoseGold: "Oro Rosa",
    themeLavenderFields: "Campi di Lavanda",
    themeSlateSteel: "Acciaio Ardesia",
    themeForestMoss: "Muschio di Foresta",
    themeNeonCyberpunk: "Neon Cyberpunk",
    themeVibrantTangerine: "Mandarino Vibrante",
    themeElectricViolet: "Viola Elettrico",
    themeVibrantCrimson: "Cremisi Vibrante",
    themeSolarGold: "Oro Solare",
    themeVividLime: "Lime Vivace",
    themeMidnightNavy: "Blu Notte",
    themeForestSage: "Salvia di Bosco",
    themeCrimsonVelvet: "Velluto Cremisi",
    themeCopperAutumn: "Rame Autunnale",
    themeTealMinimalist: "Teal Minimalista",
    themePlumLuxury: "Prugna di Lusso",
    overwriteConfirm: "Un CV portant ce nom existe déjà. Voulez-vous le remplacer ?",
    stylesTitle: "Configuration des styles",
    resetTooltip: "Réinitialiser tous les styles",
    metaTitleSuffix: "Concevoir des CV A4 côté client",
    githubStarText: "Se trovi utile questo progetto, considera di mettere una stella su GitHub! ⭐",
    linkTab: "Link"
  },
  es: {
    deleteConfirm: "¿Está seguro de que desea eliminar este currículum? Esta acción no se puede deshacer.",
    deletedToast: "Currículum eliminado",
    clickToLoad: "Haga clic para cargar",
    backupSectionTitle: "Respaldar currículum y estilos actuales",
    nameRequired: "Por favor ingrese un nombre para el currículum",
    loadSuccess: "¡Currículum y estilos cargados!",
    resetConfirm: "¿Está seguro de que desea restablecer todos los estilos personalizados? Esto restaurará los colores y la tipografía predeterminados de la plantilla.",
    resetSuccess: "Estilos restablecidos a los valores predeterminados",
    pdfGeneratingToast: "Generando PDF, por favor espere...",
    pdfSuccess: "¡PDF exportado con éxito!",
    pdfError: "Error al generar el PDF, por favor intente de nuevo.",
    mdSuccess: "¡Markdown exportado con éxito!",
    mdError: "Error al exportar",
    pageBreakTip: "Consejo: El uso lógico de secciones (##) y subsecciones (###) evita cortes de página no deseados.",
    showPanel: "Mostrar panel",
    hidePanel: "Ocultar panel",
    overallTab: "General",
    bodyTab: "Cuerpo",
    boldTab: "Negrita",
    italicTab: "Cursiva",
    layoutClassic: "Corporativo Clásico",
    layoutCreative: "Creativo Moderno",
    layoutMinimalist: "Minimalista Limpio",
    layoutDeveloper: "Tecnológico Desarrollador",
    layoutAcademic: "CV Académico",
    layoutPortfolio: "Portafolio Audaz",
    layoutCompact: "Compacto Denso",
    layoutEditorial: "Editorial",
    layoutModernist: "Moderno Limpio",
    layoutExecutive: "Ejecutivo Elegante",
    layoutTech: "Tech Avanzado",
    layoutVintage: "Vintage Literario",
    layoutGrid: "Cuadrícula Portfolio",
    layoutClean: "Minimalista Claro",
    layoutBold: "Alto Contraste",
    layoutStylish: "Acento Elegante",
    layoutHybrid: "Columnas Híbridas",
    themeRoyalSapphire: "Zafiro Real",
    themeEmeraldForest: "Bosque de Esmeralda",
    themeBurgundyExecutive: "Borgoña Ejecutivo",
    themeCharcoalModern: "Carbón Moderno",
    themeSunsetBronze: "Bronce de Atardecer",
    themeMidnightPurple: "Púrpura de Medianoche",
    themeOceanTeal: "Azul Verdoso del Océano",
    themeWarmTerracotta: "Terracota Cálida",
    themeRoseGold: "Oro Rosa",
    themeLavenderFields: "Campos de Lavanda",
    themeSlateSteel: "Acero Pizarra",
    themeForestMoss: "Musgo del Bosque",
    themeNeonCyberpunk: "Neón Cyberpunk",
    themeVibrantTangerine: "Mandarina Vibrante",
    themeElectricViolet: "Violeta Eléctrico",
    themeVibrantCrimson: "Carmesí Vibrante",
    themeSolarGold: "Oro Solar",
    themeVividLime: "Verde Lima Vivo",
    themeMidnightNavy: "Azul Marino Medianoche",
    themeForestSage: "Salvia del Bosque",
    themeCrimsonVelvet: "Terciopelo Carmesí",
    themeCopperAutumn: "Otoño Cobrizo",
    themeTealMinimalist: "Teal Minimalista",
    themePlumLuxury: "Ciruela de Lujo",
    overwriteConfirm: "Un CV portant ce nom existe déjà. Voulez-vous le remplacer ?",
    stylesTitle: "Configuration des styles",
    resetTooltip: "Réinitialiser tous les styles",
    metaTitleSuffix: "Concevoir des CV A4 côté client",
    githubStarText: "Si este proyecto te resulta útil, ¡considera darle una estrella en GitHub! ⭐",
    linkTab: "Enlace"
  },
  pt: {
    deleteConfirm: "Tem certeza de que deseja excluir este currículo? Esta ação não pode ser desfeita.",
    deletedToast: "Currículo excluído",
    clickToLoad: "Clique para carregar",
    backupSectionTitle: "Salvar currículo e estilos atuais",
    nameRequired: "Por favor, digite um nome para o currículo",
    loadSuccess: "Currículo e estilos carregados!",
    resetConfirm: "Tem certeza de que deseja restaurar todos os estilos personalizados? Isso restaurará as cores e a tipografia padrão do modelo.",
    resetSuccess: "Estilos restaurados para os padrões",
    pdfGeneratingToast: "Gerando PDF, aguarde...",
    pdfSuccess: "PDF exportado com sucesso!",
    pdfError: "Falha na geração do PDF, tente novamente.",
    mdSuccess: "Markdown exportado com sucesso!",
    mdError: "Falha na exportação",
    pageBreakTip: "Dica: O uso lógico de seções (##) e subseções (###) evita quebras de página indesejadas.",
    showPanel: "Mostrar painel",
    hidePanel: "Ocultar painel",
    overallTab: "Geral",
    bodyTab: "Corpo",
    boldTab: "Negrito",
    italicTab: "Itálico",
    layoutClassic: "Corporativo Clássico",
    layoutCreative: "Criativo Moderno",
    layoutMinimalist: "Minimalista Limpo",
    layoutDeveloper: "Tecnológico Desenvolvedor",
    layoutAcademic: "Currículo Acadêmico",
    layoutPortfolio: "Portfólio Ousado",
    layoutCompact: "Compacto Denso",
    layoutEditorial: "Editorial",
    layoutModernist: "Moderno Limpo",
    layoutExecutive: "Executivo Elegante",
    layoutTech: "Tech Avançado",
    layoutVintage: "Vintage Literário",
    layoutGrid: "Grade Portfolio",
    layoutClean: "Minimalista Puro",
    layoutBold: "Alto Contraste",
    layoutStylish: "Acento Elegante",
    layoutHybrid: "Colunas Híbridas",
    themeRoyalSapphire: "Safira Real",
    themeEmeraldForest: "Floresta de Esmeralda",
    themeBurgundyExecutive: "Borgonha Executivo",
    themeCharcoalModern: "Carvão Moderno",
    themeSunsetBronze: "Bronze do Pôr do Sol",
    themeMidnightPurple: "Roxo da Meia-noite",
    themeOceanTeal: "Verde-azulado do Oceano",
    themeWarmTerracotta: "Terracota Quente",
    themeRoseGold: "Ouro Rosa",
    themeLavenderFields: "Campos de Lavanda",
    themeSlateSteel: "Aço Ardósia",
    themeForestMoss: "Musgo da Floresta",
    themeNeonCyberpunk: "Neon Cyberpunk",
    themeVibrantTangerine: "Tangerina Vibrante",
    themeElectricViolet: "Violeta Elétrico",
    themeVibrantCrimson: "Carmesim Vibrante",
    themeSolarGold: "Ouro Solar",
    themeVividLime: "Verde Lima Vivo",
    themeMidnightNavy: "Azul Marinho da Meia-Noite",
    themeForestSage: "Salva da Floresta",
    themeCrimsonVelvet: "Veludo Carmesim",
    themeCopperAutumn: "Outono de Cobre",
    themeTealMinimalist: "Teal Minimalista",
    themePlumLuxury: "Ameixa de Luxo",
    overwriteConfirm: "Ein Lebenslauf mit diesem Namen existiert bereits. Möchten Sie ihn überschreiben?",
    stylesTitle: "Stilkonfiguration",
    resetTooltip: "Alle Stile zurücksetzen",
    metaTitleSuffix: "A4-Lebensläufe clientseitig entwerfen",
    githubStarText: "Se você achar este projeto útil, por favor, dê uma estrela no GitHub! ⭐",
    linkTab: "Link"
  },
  ja: {
    deleteConfirm: "この履歴書のバックアップを削除してもよろしいですか？この操作は取り消せません。",
    deletedToast: "履歴書を削除しました",
    clickToLoad: "クリックして読み込み",
    backupSectionTitle: "現在の履歴書とスタイルを保存",
    nameRequired: "履歴書の名前を入力してください",
    loadSuccess: "履歴書とスタイルを読み込みました！",
    resetConfirm: "すべてのカスタムスタイルをリセットしてもよろしいですか？テンプレートのデフォルト色とフォント設定に戻ります。",
    resetSuccess: "スタイルをデフォルトにリセットしました",
    pdfGeneratingToast: "PDFを生成しています。しばらくお待ちください...",
    pdfSuccess: "PDFのエクスポートに成功しました！",
    pdfError: "PDFの生成に失敗しました。もう一度お試しください。",
    mdSuccess: "Markdownのエクスポートに成功しました！",
    mdError: "エクスポートに失敗しました",
    pageBreakTip: "ヒント: 見出し2(##)および見出し3(###)を適切に使用することで、PDF出力時の改ページでのテキスト切断を自動的に防止できます。",
    showPanel: "パネル表示",
    hidePanel: "パネル非表示",
    overallTab: "全体",
    bodyTab: "本文",
    boldTab: "太字",
    italicTab: "斜体",
    layoutClassic: "クラシックコーポレート (伝統的)",
    layoutCreative: "クリエイティブモダン (サイドバー)",
    layoutMinimalist: "ミニマリストクリーン (余白重視)",
    layoutDeveloper: "デベロッパーテック (等幅フォント)",
    layoutAcademic: "アカデミックCV (フォーマル明朝)",
    layoutPortfolio: "ボールドポートフォリオ (個性的)",
    layoutCompact: "데ンスコンパクト (1ページ推奨)",
    layoutEditorial: "Editorial",
    layoutModernist: "モダンクリーン",
    layoutExecutive: "エグゼクティブ",
    layoutTech: "アドバンスドテック",
    layoutVintage: "ヴィンテージ文芸",
    layoutGrid: "グリッド配置",
    layoutClean: "クリアミニマル",
    layoutBold: "コントラスト",
    layoutStylish: "スタイリッシュ",
    layoutHybrid: "ハイブリッド2欄",
    themeRoyalSapphire: "ロイヤルサファイア",
    themeEmeraldForest: "エメラルドフォレスト",
    themeBurgundyExecutive: "バーガンディエグゼクティブ",
    themeCharcoalModern: "チャコールモダン",
    themeSunsetBronze: "サンセットブロンズ",
    themeMidnightPurple: "ミッドナイトパープル",
    themeOceanTeal: "オーシャンティール",
    themeWarmTerracotta: "ウォームテラコッタ",
    themeRoseGold: "ローズゴールド",
    themeLavenderFields: "ラベンダーフィールド",
    themeSlateSteel: "スレートスチール",
    themeForestMoss: "フォレストモス",
    themeNeonCyberpunk: "ネオンサイバーパンク",
    themeVibrantTangerine: "ビブラントタンジェリン",
    themeElectricViolet: "エレクトリックバイオレット",
    themeVibrantCrimson: "ビブラントクリムゾン",
    themeSolarGold: "ソーラーゴールド",
    themeVividLime: "ビビッドライム",
    themeMidnightNavy: "ミッドナイトネイビー",
    themeForestSage: "フォレストセージ",
    themeCrimsonVelvet: "クリムゾンベルベット",
    themeCopperAutumn: "コッパーオータム",
    themeTealMinimalist: "ティールミニマリスト",
    themePlumLuxury: "プラムラグジュアリー",
    overwriteConfirm: "Ein Lebenslauf mit diesem Namen existiert bereits. Möchten Sie ihn überschreiben?",
    stylesTitle: "Stilkonfiguration",
    resetTooltip: "Alle Stile zurücksetzen",
    metaTitleSuffix: "A4-Lebensläufe clientseitig entwerfen",
    githubStarText: "このプロジェクトが気に入ったら、GitHubでスターをお願いします！⭐",
    linkTab: "リンク"
  },
  ko: {
    deleteConfirm: "이 이력서 백업을 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.",
    deletedToast: "이력서가 삭제되었습니다",
    clickToLoad: "클릭하여 불러오기",
    backupSectionTitle: "현재 이력서 및 스타일 백업",
    nameRequired: "이력서 이름을 입력하십시오",
    loadSuccess: "이력서와 스타일을 불러왔습니다!",
    resetConfirm: "모든 사용자 지정 스타일을 재설정하시겠습니까? 템플릿 기본 색상과 서체 설정으로 돌아갑니다.",
    resetSuccess: "스타일이 기본값으로 재설정되었습니다",
    pdfGeneratingToast: "PDF를 생성하고 있습니다. 잠시만 기다려 주십시오...",
    pdfSuccess: "PDF를 성공적으로 내보냈습니다!",
    pdfError: "PDF 생성에 실패했습니다. 다시 시도하십시오.",
    mdSuccess: "Markdown을 성공적으로 내보냈습니다!",
    mdError: "내보내기 실패",
    pageBreakTip: "팁: ##(섹션) 및 ###(하위 항목)을 논리적으로 사용하면 PDF 인쇄 시 텍스트 잘림을 자동으로 방지할 수 있습니다.",
    showPanel: "패널 표시",
    hidePanel: "패널 숨기기",
    overallTab: "전체",
    bodyTab: "본문",
    boldTab: "굵게",
    italicTab: "기울임",
    layoutClassic: "클래식 기업형 (명조)",
    layoutCreative: "크리에이티브 현대형 (사이드바)",
    layoutMinimalist: "미니멀리스트 청결형 (여백)",
    layoutDeveloper: "개발자 기술형 (고딕/고정폭)",
    layoutAcademic: "학술 연구용 CV (포멀 세리프)",
    layoutPortfolio: "볼드 포트폴리오 (예술적)",
    layoutCompact: "조밀 콤팩트형 (1페이지 권장)",
    layoutEditorial: "Editorial",
    layoutModernist: "모던 클린",
    layoutExecutive: "엘레강트 이그제큐티브",
    layoutTech: "어드밴스드 테크",
    layoutVintage: "빈티지 문예",
    layoutGrid: "그리드 포트폴리오",
    layoutClean: "클리어 미니멀",
    layoutBold: "고대비 볼드",
    layoutStylish: "스타일리시 디자인",
    layoutHybrid: "하이브리드 다단",
    themeRoyalSapphire: "로열 사파이어",
    themeEmeraldForest: "에메랄드 포레스트",
    themeBurgundyExecutive: "버건디 익제큐티브",
    themeCharcoalModern: "차콜 모던",
    themeSunsetBronze: "선셋 브론즈",
    themeMidnightPurple: "미드나잇 퍼플",
    themeOceanTeal: "오션 틸",
    themeWarmTerracotta: "웜 테라코타",
    themeRoseGold: "로즈 골드",
    themeLavenderFields: "라벤더 필드",
    themeSlateSteel: "슬레이트 스틸",
    themeForestMoss: "포레스트 모스",
    themeNeonCyberpunk: "네온 사이버펑크",
    themeVibrantTangerine: "비브란트 탠저린",
    themeElectricViolet: "일렉트릭 바이올렛",
    themeVibrantCrimson: "비브란트 크림슨",
    themeSolarGold: "솔라 골드",
    themeVividLime: "비비드 라임",
    themeMidnightNavy: "미드나잇 네이비",
    themeForestSage: "포레스트 세이지",
    themeCrimsonVelvet: "크림슨 벨벳",
    themeCopperAutumn: "코퍼 오텀",
    themeTealMinimalist: "틸 미니멀리스트",
    themePlumLuxury: "플럼 럭셔리",
    overwriteConfirm: "Un curriculum con questo nome esiste già. Vuoi sovrascriverlo?",
    stylesTitle: "Configurazione stili",
    resetTooltip: "Ripristina tutti gli stili",
    metaTitleSuffix: "Progetta CV A4 lato client",
    githubStarText: "이 프로젝트가 유용하셨다면 GitHub에서 스타를 눌러주세요! ⭐",
    linkTab: "링크"
  },
  ru: {
    deleteConfirm: "Вы уверены, что хотите удалить эту резервную копию резюме? Это действие необратимо.",
    deletedToast: "Резюме удалено",
    clickToLoad: "Нажмите для загрузки",
    backupSectionTitle: "Сохранить текущее резюме и стили",
    nameRequired: "Пожалуйста, введите название резюме",
    loadSuccess: "Резюме и стили загружены!",
    resetConfirm: "Вы уверены, что хотите сбросить все пользовательские стили? Будут восстановлены исходные цвета и шрифты шаблона.",
    resetSuccess: "Стили сброшены до значений по умолчанию",
    pdfGeneratingToast: "Создание PDF, пожалуйста, подождите...",
    pdfSuccess: "PDF успешно экспортирован!",
    pdfError: "Ошибка при создании PDF, пожалуйста, попробуйте еще раз.",
    mdSuccess: "Markdown успешно экспортирован!",
    mdError: "Ошибка экспорта",
    pageBreakTip: "Совет: Разумное использование заголовков (##) и подзаголовков (###) автоматически предотвращает разрывы страниц посреди текста резюме.",
    showPanel: "Показать панель",
    hidePanel: "Скрыть панель",
    overallTab: "Общие",
    bodyTab: "Текст",
    boldTab: "Жирный",
    italicTab: "Курсив",
    layoutClassic: "Классический корпоративный",
    layoutCreative: "Креативный современный",
    layoutMinimalist: "Чистый минимализм",
    layoutDeveloper: "Технический разработчик",
    layoutAcademic: "Академический CV",
    layoutPortfolio: "Смелое портфолио",
    layoutCompact: "Плотный компактный",
    layoutEditorial: "Editorial",
    layoutModernist: "Современный чистый",
    layoutExecutive: "Элегантный бизнес",
    layoutTech: "Высокие технологии",
    layoutVintage: "Книжный винтаж",
    layoutGrid: "Сетка портфолио",
    layoutClean: "Чистый минимализм",
    layoutBold: "Высокий контраст",
    layoutStylish: "Стильный акцент",
    layoutHybrid: "Гибридный двухколоночный",
    themeRoyalSapphire: "Королевский Сапфир",
    themeEmeraldForest: "Изумрудный Лес",
    themeBurgundyExecutive: "Бордовый Руководитель",
    themeCharcoalModern: "Современный Угольный",
    themeSunsetBronze: "Закатная Бронза",
    themeMidnightPurple: "Полуночный Пурпурный",
    themeOceanTeal: "Морской Зеленый",
    themeWarmTerracotta: "Теплая Терракота",
    themeRoseGold: "Розовое Золото",
    themeLavenderFields: "Лавандовые Поля",
    themeSlateSteel: "Сланцевая Сталь",
    themeForestMoss: "Лесной Мох",
    themeNeonCyberpunk: "Неоновый Киберпанк",
    themeVibrantTangerine: "Яркий Мандарин",
    themeElectricViolet: "Электрический Фиолетовый",
    themeVibrantCrimson: "Яркий Малиновый",
    themeSolarGold: "Солнечное Золото",
    themeVividLime: "Яркий Лайм",
    themeMidnightNavy: "Полуночный синий",
    themeForestSage: "Лесной шалфей",
    themeCrimsonVelvet: "Малиновый бархат",
    themeCopperAutumn: "Медная осень",
    themeTealMinimalist: "Минималистичный чирок",
    themePlumLuxury: "Роскошный сливовый",
    overwriteConfirm: "Un curriculum con questo nome esiste già. Vuoi sovrascriverlo?",
    stylesTitle: "Configurazione stili",
    resetTooltip: "Ripristina tutti gli stili",
    metaTitleSuffix: "Progetta CV A4 lato client",
    githubStarText: "Если проект вам понравился, поставьте, пожалуйста, звезду на GitHub! ⭐",
    linkTab: "Ссылка"
  },
  "zh-tw": {
    deleteConfirm: "確定要刪除此履歷備份嗎？此操作無法復原。",
    deletedToast: "履歷已刪除",
    clickToLoad: "點擊載入",
    backupSectionTitle: "備份目前履歷與樣式",
    nameRequired: "請輸入履歷名稱",
    loadSuccess: "已載入所選履歷及樣式",
    resetConfirm: "確定要重置所有自訂樣式嗎？此操作將恢復範本的預設排版與顏色。",
    resetSuccess: "樣式已重置為預設值",
    pdfGeneratingToast: "正在準備列印，請稍候...",
    pdfSuccess: "列印準備就緒！",
    pdfError: "PDF 列印失敗，請重試。",
    mdSuccess: "Markdown 匯出成功！",
    mdError: "匯出失敗",
    pageBreakTip: "提示：合理使用二級標題(##)和三級標題(###)可以自動避免內容在PDF分頁處被截斷。",
    showPanel: "顯示面板",
    hidePanel: "隱藏面板",
    overallTab: "全域",
    bodyTab: "本文",
    boldTab: "粗體",
    italicTab: "斜體",
    layoutClassic: "經典行政 (經典)",
    layoutCreative: "創意現代 (側欄)",
    layoutMinimalist: "極簡乾淨 (留白)",
    layoutDeveloper: "開發技術 (等寬)",
    layoutAcademic: "學術履歷 (傳統襯線)",
    layoutPortfolio: "個性作品集 (藝術粗體)",
    layoutCompact: "緊湊高密 (單頁推薦)",
    layoutEditorial: "Editorial",
    layoutModernist: "現代清潔 (頂部飾條)",
    layoutExecutive: "優雅行政 (彩色頁眉)",
    layoutTech: "前沿技術 (分區格線)",
    layoutVintage: "復古文藝 (溫潤襯線)",
    layoutGrid: "網格排版 (結構對齊)",
    layoutClean: "極簡輕盈 (呼吸留白)",
    layoutBold: "高對比粗獷 (深色頁眉)",
    layoutStylish: "風尚藝術 (靈動細節)",
    layoutHybrid: "混合雙欄 (側邊信息)",
    themeRoyalSapphire: "皇家藍寶石",
    themeEmeraldForest: "翡翠森林",
    themeBurgundyExecutive: "勃艮第行政",
    themeCharcoalModern: "現代炭黑",
    themeSunsetBronze: "落日青銅",
    themeMidnightPurple: "午夜深紫",
    themeOceanTeal: "海洋深綠",
    themeWarmTerracotta: "溫慢陶土",
    themeRoseGold: "玫瑰金",
    themeLavenderFields: "薰衣草田",
    themeSlateSteel: "板岩鋼灰",
    themeForestMoss: "森林苔蘚",
    themeNeonCyberpunk: "霓虹賽博",
    themeVibrantTangerine: "活力蜜橘",
    themeElectricViolet: "極光野紫",
    themeVibrantCrimson: "狂耀猩紅",
    themeSolarGold: "曜日烈金",
    themeVividLime: "極速耀綠",
    themeMidnightNavy: "極夜深藍",
    themeForestSage: "雅致鼠尾草",
    themeCrimsonVelvet: "絲絨緋紅",
    themeCopperAutumn: "金秋紅銅",
    themeTealMinimalist: "極簡青黛",
    themePlumLuxury: "尊貴奢華梅",
    overwriteConfirm: "已存在同名備份，是否要覆蓋它？",
    stylesTitle: "樣式配置",
    resetTooltip: "重置所有樣式",
    metaTitleSuffix: "專業 Markdown 履歷排版生成器",
    githubStarText: "如果您覺得本專案有幫助，請在 GitHub 上點個 Star 支持一下！⭐",
    linkTab: "連結"
  },
  uk: {
    deleteConfirm: "Ви впевнені, що хочете видалити цю копію резюме? Цю дію не можна скасувати.",
    deletedToast: "Резюме видалено",
    clickToLoad: "Натисніть для завантаження",
    backupSectionTitle: "Зберегти поточне резюме та стилі",
    nameRequired: "Будь ласка, введіть назву резюме",
    loadSuccess: "Резюме та стилі завантажено!",
    resetConfirm: "Ви впевнені, що хочете скинути всі налаштовані стилі? Це відновить оригінальні кольори та шрифти шаблону.",
    resetSuccess: "Стили скинуто до значень за замовчуванням",
    pdfGeneratingToast: "Створення PDF, будь ласка, зачекайте...",
    pdfSuccess: "PDF успішно експортовано!",
    pdfError: "Помилка при створенні PDF, спробуйте ще раз.",
    mdSuccess: "Markdown успішно експортовано!",
    mdError: "Помилка експорту",
    pageBreakTip: "Порада: Логічне використання розділів (##) та підрозділів (###) автоматично запобігає розривам сторінок посеред пунктів резюме.",
    showPanel: "Показати панель",
    hidePanel: "Приховати панель",
    overallTab: "Загальні",
    bodyTab: "Текст",
    boldTab: "Жирний",
    italicTab: "Курсив",
    layoutClassic: "Класичний корпоративний",
    layoutCreative: "Креативний сучасний",
    layoutMinimalist: "Чистий мінімалізм",
    layoutDeveloper: "Технічний розробник",
    layoutAcademic: "Академічний CV",
    layoutPortfolio: "Сміливе портфоліо",
    layoutCompact: "Щільний компактний",
    layoutEditorial: "Editorial",
    layoutModernist: "Сучасний чистий",
    layoutExecutive: "Елегантний бізнес",
    layoutTech: "Високі технології",
    layoutVintage: "Книжковий вінтаж",
    layoutGrid: "Сітка портфоліо",
    layoutClean: "Чистий мінімалізм",
    layoutBold: "Високий контраст",
    layoutStylish: "Стильний акцент",
    layoutHybrid: "Гібридний двоколоночний",
    themeRoyalSapphire: "Королівський Сапфір",
    themeEmeraldForest: "Смарагдовий Ліс",
    themeBurgundyExecutive: "Бордовый Керівник",
    themeCharcoalModern: "Сучасний Вугільний",
    themeSunsetBronze: "Західна Бронза",
    themeMidnightPurple: "Опівнічний Пурпуровий",
    themeOceanTeal: "Морський Зелений",
    themeWarmTerracotta: "Тепла Теракота",
    themeRoseGold: "Рожеве Золото",
    themeLavenderFields: "Лавандові Поля",
    themeSlateSteel: "Сланцева Сталь",
    themeForestMoss: "Лісовий Мох",
    themeNeonCyberpunk: "Неоновий Кіберпанк",
    themeVibrantTangerine: "Яскравий Мандарин",
    themeElectricViolet: "Електричний Фіолетовий",
    themeVibrantCrimson: "Яскравий Малиновий",
    themeSolarGold: "Сонячне Золото",
    themeVividLime: "Яскравий Лайм",
    themeMidnightNavy: "Опівнічний синій",
    themeForestSage: "Лісова шавлія",
    themeCrimsonVelvet: "Малиновий оксамит",
    themeCopperAutumn: "Мідна осінь",
    themeTealMinimalist: "Мінімалістичний чирок",
    themePlumLuxury: "Розкішний сливковий",
    overwriteConfirm: "Ya existe un currículum con este nombre. ¿Desea sobrescribirlo?",
    stylesTitle: "Configuración de estilos",
    resetTooltip: "Restablecer todos los estilos",
    metaTitleSuffix: "Diseño de currículums A4 en el cliente",
    githubStarText: "Якщо проект став вам у пригоді, будь ласка, поставте зірку на GitHub! ⭐",
    linkTab: "Посилання"
  },
};
