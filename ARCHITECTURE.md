# KiCAD Prism — Полная Архитектура и Возможности

## 📋 Обзор Проекта

**KiCAD Prism** — это современная веб-платформа для визуализации, рецензирования и управления проектами KiCAD. Платформа заполняет разрыв между настольными EDA-системами и совместной веб-разработкой, предоставляя возможности для исследования проектов, командных рецензий и автоматизированных производственных рабочих процессов.

**Целевая аудитория:**
- Команды разработчиков электроники
- Открытое hardware-сообщество
- Инженеры, работающие с KiCAD проектами

**Основная ценность:**
- Централизованное управление проектами
- Визуализация без установки KiCAD
- Совместные рецензии с комментариями
- Автоматизация производственных выходов

---

## 🏗️ Архитектура Системы

### Общая Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                        Клиент (Браузер)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  Workspace  │  │  Visualizer  │  │  Assets/Docs Portal │   │
│  │  Dashboard  │  │  SCH/PCB/3D  │  │  Markdown Viewer    │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │   Comments  │  │ Visual Diff  │  │  Workflows Runner   │   │
│  │   System    │  │  Comparison  │  │  kicad-cli Jobs     │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕ HTTP/REST API
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI + Python)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │   Projects  │  │    Git       │  │   Comments Store    │   │
│  │   Service   │  │   Service    │  │   (SQLite + JSON)   │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │    Diff     │  │    File      │  │   Path Config       │   │
│  │   Service   │  │   Service    │  │   (.prism.json)     │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              kicad-cli (v9.0+) Integration              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕ File System
┌─────────────────────────────────────────────────────────────────┐
│                    Хранилище Данных (Docker Volume)             │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  Projects   │  │   Monorepos  │  │   SQLite DB         │   │
│  │  /type1/    │  │   /type2/    │  │  comments.db        │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Технологический Стек

#### Frontend
| Компонент | Технология | Назначение |
|-----------|------------|------------|
| **Фреймворк** | React 18.3+ | UI компонентная модель |
| **Сборка** | Vite 6.2+ | Быстрая разработка и билд |
| **Язык** | TypeScript 5.7+ | Типизация |
| **Стили** | Tailwind CSS 3.4+ | Утилитарные стили |
| **UI Компоненты** | Radix UI + ShadCN | Доступные компоненты |
| **Иконки** | Lucide React | Векторные иконки |
| **Роутинг** | React Router 7+ | Навигация |
| **3D Viewer** | Three.js + online-3d-viewer | 3D визуализация |
| **Markdown** | react-markdown + rehype-raw | Рендеринг документации |
| **Поиск** | Fuse.js 7+ | Нечёткий поиск |
| **Уведомления** | Sonner | Toast уведомления |
| **OAuth** | @react-oauth/google | Google авторизация |

#### Backend
| Компонент | Технология | Назначение |
|-----------|------------|------------|
| **Фреймворк** | FastAPI | REST API |
| **Язык** | Python 3.10+ | Бизнес-логика |
| **Git** | GitPython | Работа с репозиториями |
| **Валидация** | Pydantic | Валидация данных |
| **Конфигурация** | pydantic-settings | Настройки |
| **Auth** | google-auth | OAuth 2.0 |
| **KiCAD** | kiutils + kicad-cli 9.0+ | Парсинг и генерация |
| **HTTP** | requests | Внешние запросы |

#### Визуализация
| Компонент | Источник | Назначение |
|-----------|----------|------------|
| **Схемы/PCB** | [ecad-viewer](https://github.com/Huaqiu-Electronics/ecad-viewer) | Рендеринг KiCAD файлов |
| **Схемы** | [KiCanvas](https://kicanvas.org) | Нативный рендеринг схем |
| **BOM** | [Interactive HTML BOM](https://github.com/quindorian/Sublime-iBOM-Plugin) | Интерактивная спецификация |
| **3D Модели** | [Three.js](https://threejs.org/) | 3D визуализация |

#### Инфраструктура
| Компонент | Технология | Назначение |
|-----------|------------|------------|
| **Контейнеризация** | Docker + Docker Compose | Развёртывание |
| **Web Server** | Nginx | Раздача статики |
| **База данных** | SQLite | Хранение комментариев |
| **Git** | Git + SSH | Управление версиями |

---

## 📁 Структура Проекта

```
KiCAD-Prism/
├── backend/                      # FastAPI бэкенд
│   ├── app/
│   │   ├── api/                  # API роутеры
│   │   │   ├── auth.py           # OAuth авторизация
│   │   │   ├── projects.py       # Проекты и файлы
│   │   │   ├── comments.py       # Комментарии CRUD
│   │   │   ├── diff.py           # Визуальные диффы
│   │   │   └── settings.py       # Настройки системы
│   │   ├── services/             # Бизнес-логика
│   │   │   ├── project_service.py        # Управление проектами
│   │   │   ├── git_service.py            # Git операции
│   │   │   ├── comments_store_service.py # Хранение комментариев
│   │   │   ├── comments_url_service.py   # URL хелперы
│   │   │   ├── path_config_service.py    # Конфигурация путей
│   │   │   ├── project_import_service.py # Импорт проектов
│   │   │   ├── file_service.py           # Работа с файлами
│   │   │   ├── bom_diff_service.py       # Сравнение BOM
│   │   │   └── diff_service.py           # Визуальные диффы
│   │   ├── core/
│   │   │   └── config.py         # Конфигурация приложения
│   │   └── main.py               # Точка входа FastAPI
│   ├── requirements.txt          # Python зависимости
│   └── Dockerfile                # Docker образ бэкенда
│
├── frontend/                     # React фронтенд
│   ├── src/
│   │   ├── components/           # UI компоненты
│   │   │   ├── ui/               # Базовые компоненты (ShadCN)
│   │   │   ├── workspace.tsx     # Дашборд проектов
│   │   │   ├── visualizer.tsx    # Визуализатор SCH/PCB/3D
│   │   │   ├── comment-overlay.tsx   # Оверлей комментариев
│   │   │   ├── comment-panel.tsx     # Панель комментариев
│   │   │   ├── comment-form.tsx      # Форма комментариев
│   │   │   ├── project-card.tsx      # Карточка проекта
│   │   │   ├── sidebar-tree.tsx      # Дерево навигации
│   │   │   ├── import-dialog.tsx     # Импорт репозиториев
│   │   │   ├── settings-dialog.tsx   # Настройки
│   │   │   ├── path-config-dialog.tsx # Конфигурация путей
│   │   │   ├── visual-diff-viewer.tsx # Визуальное сравнение
│   │   │   ├── history-viewer.tsx    # История коммитов
│   │   │   ├── model-3d-viewer.tsx   # 3D вьювер
│   │   │   ├── assets-portal.tsx     # Портал ассетов
│   │   │   ├── documentation-browser.tsx # Браузер документации
│   │   │   └── login-page.tsx        # Страница входа
│   │   ├── pages/
│   │   │   └── ProjectDetailPage.tsx # Детальная страница проекта
│   │   ├── types/                # TypeScript типы
│   │   │   ├── auth.ts           # Типы авторизации
│   │   │   ├── project.ts        # Типы проектов
│   │   │   └── comments.ts       # Типы комментариев
│   │   ├── lib/                  # Утилиты
│   │   ├── assets/               # Статические ресурсы
│   │   ├── App.tsx               # Корневой компонент
│   │   ├── main.tsx              # Точка входа
│   │   └── index.css             # Глобальные стили
│   ├── public/                   # Публичные файлы
│   ├── package.json              # Node зависимости
│   ├── vite.config.ts            # Конфигурация Vite
│   ├── tailwind.config.js        # Конфигурация Tailwind
│   ├── tsconfig.json             # Конфигурация TypeScript
│   └── Dockerfile                # Docker образ фронтенда
│
├── data/                         # Хранилище данных (Docker volume)
│   ├── projects/
│   │   ├── type1/                # Standalone проекты
│   │   └── type2/                # Monorepo проекты
│   └── ssh/                      # SSH ключи для Git
│
├── assets/                       # Медиа для документации
│   └── *.png                     # Скриншоты интерфейса
│
├── docs/                         # Документация разработки
│   ├── COMMENTS-COLLAB-UPDATES.md    # Обновления системы комментариев
│   ├── WORKSPACE_UX_IMPROVEMENTS.md  # Улучшения UX workspace
│   └── CUSTOM_PROJECT_NAMES.md       # Кастомные имена проектов
│
├── docker-compose.yml            # Оркестрация контейнеров
├── .env.example                  # Шаблон переменных окружения
├── README.md                     # Основная документация
├── DEPLOYMENT.md                 # Руководство по развёртыванию
├── KICAD-PRJ-REPO-STRUCTURE.md   # Структура проектов KiCAD
└── PATH-MAPPING.md               # Система маппинга путей
```

---

## 🔑 Ключевые Возможности

### 1. Управление Рабочим Пространством

**Описание:** Централизованный дашборд для управления всеми проектами KiCAD.

**Функции:**
- Импорт проектов из GitHub/GitLab через асинхронные задачи
- Поддержка monorepo с автоматическим обнаружением подпроектов
- Нечёткий поиск с Fuse.js (допуск опечаток)
- Подсветка результатов поиска
- Кэширование структуры monorepo для быстрой навигации
- Отображение последних открытых проектов
- Синхронизация с удалёнными репозиториями

**Типы импорта:**
- **Type-1 (Standalone):** Одиночный проект в корне репозитория
- **Type-2 (Monorepo):** Несколько подпроектов в одном репозитории

**API Endpoints:**
```
GET  /api/projects/              # Список всех проектов
GET  /api/projects/monorepos     # Список monorepos
GET  /api/projects/monorepos/{repo}/structure  # Структура monorepo
GET  /api/projects/search?q=     # Поиск проектов
POST /api/projects/analyze       # Анализ репозитория
POST /api/projects/import        # Импорт проекта
GET  /api/projects/jobs/{job_id} # Статус задачи импорта
POST /api/projects/{id}/sync     # Синхронизация с remote
```

---

### 2. Визуализатор Проектов

**Описание:** Интерактивный просмотрщик схем, PCB и 3D моделей.

**Режимы просмотра:**
- **Схемы (SCH):** Рендеринг через ecad-viewer/KiCanvas
  - Поддержка иерархических подсхем
  - Кросс-пробинг между схемой и PCB
  - Навигация по листам
- **PCB:** Просмотр слоёв платы
  - Переключение слоёв
  - Масштабирование и панорамирование
- **3D:** Трёхмерная модель платы
  - Регулировка яркости сцены
  - Управление направлением освещения
  - Вращение и масштабирование
- **iBOM:** Интерактивная спецификация
  - Фильтрация компонентов
  - Поиск по позициям
  - Экспорт в различные форматы

**API Endpoints:**
```
GET  /api/projects/{id}/schematic        # Файл схемы
GET  /api/projects/{id}/schematic/subsheets  # Подсхемы
GET  /api/projects/{id}/pcb              # Файл PCB
GET  /api/projects/{id}/3d-model         # 3D модель (.step/.glb)
GET  /api/projects/{id}/ibom             # Interactive BOM
```

---

### 3. Система Комментариев

**Описание:** Совместные рецензии с контекстными комментариями на элементах дизайна.

**Функции:**
- Добавление комментариев на схему/PCB с координатами
- Древовидные ответы (threaded replies)
- Статусы комментариев (открыт/решён)
- Визуальные маркеры на схеме (pins)
- Панель комментариев с навигацией
- Клик по комментарию → зум на позицию
- Хранение в SQLite + экспорт в `.comments/comments.json`
- REST API для интеграции с KiCAD (будущая функция)

**Модель данных:**
```typescript
interface Comment {
  id: string;
  project_id: string;
  page: string;           // Страница схемы/PCB
  context: "SCH" | "PCB";
  x: number;              // Координаты
  y: number;
  content: string;
  status: "open" | "resolved";
  author: string;
  created_at: string;
  replies: CommentReply[];
}
```

**API Endpoints:**
```
GET    /api/projects/{id}/comments           # Список комментариев
POST   /api/projects/{id}/comments           # Создать комментарий
PATCH  /api/projects/{id}/comments/{cid}     # Обновить статус
POST   /api/projects/{id}/comments/{cid}/replies  # Добавить ответ
DELETE /api/projects/{id}/comments/{cid}     # Удалить комментарий
POST   /api/projects/{id}/comments/push      # Экспорт в JSON
GET    /api/projects/{id}/comments/source-urls  # URL для KiCAD
```

**Хранение данных:**
- **Основное:** SQLite база данных (`comments.db`)
- **Экспорт:** `.comments/comments.json` (для Git)
- **Импорт:** Автоматическая загрузка существующих JSON при первом запуске

---

### 4. Визуальное Сравнение (Diff)

**Описание:** Сравнение версий проектов между коммитами.

**Типы сравнения:**
- **Схемы:** Визуальное наложение с регулятором прозрачности
- **PCB:** Сравнение слоёв и трассировки
- **BOM:** Структурное сравнение спецификаций
  - Статусы: Добавлен/Удалён/Изменён
  - Поддержка кастомных полей через `.prism.json`

**Функции:**
- Переключение между версиями
- Подсветка изменений
- Асимметричный diff для BOM
- Фильтрация по статусу изменений

**API Endpoints:**
```
GET /api/projects/{id}/diff/schematic?from={commit1}&to={commit2}
GET /api/projects/{id}/diff/pcb?from={commit1}&to={commit2}
GET /api/projects/{id}/diff/bom?from={commit1}&to={commit2}
```

---

### 5. Автоматизированные Рабочие Процессы

**Описание:** Генерация выходных файлов через `kicad-cli`.

**Типы workflows:**
- **Design Outputs:**
  - PDF схем
  - 3D модели (.step, .glb)
  - Interactive BOM
- **Manufacturing Outputs:**
  - Gerber файлы
  - Drill файлы
  - BOM для производства
  - Pick-and-place данные
- **Render Outputs:**
  - Ray-traced рендеры платы

**Конфигурация:**
- Файл `Outputs.kicad_jobset` определяет выходы
- Автоматический коммит и push результатов
- Поддержка кастомных workflow через скрипты

**API Endpoints:**
```
POST /api/projects/{id}/workflows
Body: { type: "design" | "manufacturing" | "render", author: string }
GET  /api/projects/{id}/jobs/{job_id}  # Статус выполнения
```

**Процесс:**
1. Пользователь запускает workflow из UI
2. Backend выполняет `kicad-cli jobset run`
3. Результаты сохраняются в `Design-Outputs/` или `Manufacturing-Outputs/`
4. Автоматический коммит изменений
5. Push в удалённый репозиторий (если настроено)

---

### 6. Портал Документации и Ассетов

**Описание:** Просмотр документации проекта и файлов ассетов.

**Функции:**
- Рендеринг Markdown с поддержкой изображений
- Встроенные изображения из репозитория
- Навигация по файлам документации
- Просмотр ассетов (рендеры, изображения)
- Поддержка иерархической структуры папок

**API Endpoints:**
```
GET  /api/projects/{id}/readme         # README проекта
GET  /api/projects/{id}/docs           # Список файлов документации
GET  /api/projects/{id}/docs/content?path={file}  # Контент файла
GET  /api/projects/{id}/asset/{path}   # Ассеты (изображения)
GET  /api/projects/{id}/files?type={design|manufacturing}  # Выходные файлы
GET  /api/projects/{id}/download?path={file}&type={design|manufacturing}
```

---

### 7. Гибкая Система Путей (Path Mapping)

**Описание:** Автоматическое обнаружение и конфигурация путей к файлам проекта.

**Приоритет определения путей:**
1. **Явный `.prism.json`** — пользовательская конфигурация
2. **Авто-обнаружение** — сканирование репозитория
3. **Fallback** — стандартные пути по умолчанию

**Конфигурация `.prism.json`:**
```json
{
  "paths": {
    "schematic": "*.kicad_sch",
    "pcb": "*.kicad_pcb",
    "subsheets": "Subsheets",
    "designOutputs": "outputs/design",
    "manufacturingOutputs": "outputs/manufacturing",
    "documentation": "documentation",
    "thumbnail": "assets/thumbnail",
    "readme": "README.md",
    "jobset": "project.kicad_jobset"
  }
}
```

**Авто-обнаружение ищет:**
- **Схемы/PCB:** Файлы `.kicad_sch` и `.kicad_pcb` в корне
- **Подсхемы:** Папки с именами `*sheet*`, `*schematic*`, `pages/`
- **Design Outputs:** Папки `*output*`, `*export*`, `*build*`, `Design-Outputs/`
- **Manufacturing:** Папки `*gerber*`, `*fab*`, `*mfg*`, `Manufacturing-Outputs/`
- **Документация:** Папки `*doc*`, `*wiki*`, `*guide*`, `docs/`
- **Thumbnail:** Папки `*assets*`, `*images*`, `*renders*`, `thumbnail/`

**API Endpoints:**
```
GET  /api/projects/{id}/config          # Текущая конфигурация
POST /api/projects/{id}/detect-paths    # Предпросмотр авто-обнаружения
PUT  /api/projects/{id}/config          # Сохранение конфигурации
```

---

### 8. Git Интеграция

**Описание:** Работа с Git репозиториями, включая поддержку SSH и токенов.

**Функции:**
- Импорт из GitHub/GitLab/Bitbucket
- Поддержка SSH ключей (генерация через UI)
- Поддержка HTTPS токенов (GitHub PAT)
- Асинхронные задачи клонирования с прогрессом
- Синхронизация с удалёнными репозиториями
- Отслеживание коммитов и тегов
- Фильтрация коммитов по подпроектам (для monorepo)

**Безопасность:**
- SSH ключи хранятся в `/root/.ssh` (Docker volume)
- GitHub токены конфигурируются через `.env`
- `GIT_TERMINAL_PROMPT=0` предотвращает зависание
- `StrictHostKeyChecking=accept-new` для SSH

**API Endpoints:**
```
GET  /api/git/commits?repo_path={path}&limit={n}
GET  /api/git/content?commit_sha={hash}&file_path={path}
GET  /api/git/releases?repo_path={path}
POST /api/git/sync?repo_path={path}
```

---

### 9. Авторизация и Контроль Доступа

**Описание:** Гибкая система аутентификации с поддержкой Google OAuth.

**Режимы работы:**
| Режим | Конфигурация | Поведение |
|-------|-------------|-----------|
| **Публичная галерея** | `AUTH_ENABLED=false` | Вход не требуется, только чтение |
| **Разработка** | `DEV_MODE=true` | Вход с кнопкой "Dev Bypass" |
| **Продакшн** | `DEV_MODE=false` + `GOOGLE_CLIENT_ID` | Полный Google OAuth |

**Контроль доступа:**
- `ALLOWED_DOMAINS_STR` — список доменов (comma-separated)
- `ALLOWED_USERS_STR` — конкретные email пользователей
- Проверка на уровне backend при каждом запросе

**OAuth Flow:**
1. Пользователь нажимает "Sign in with Google"
2. Перенаправление на Google OAuth 2.0
3. Возврат с ID токеном
4. Валидация токена через `google-auth`
5. Проверка домена/email в списке разрешённых
6. Сохранение пользователя в `localStorage`

**API Endpoints:**
```
GET  /api/auth/config        # Конфигурация авторизации
POST /api/auth/verify         # Верификация токена
```

---

## 🗂️ Модель Данных

### Проекты

```typescript
interface Project {
  id: string;                    // Уникальный ID
  name: string;                  // Имя проекта
  display_name?: string;         // Кастомное имя из .prism.json
  description: string;           // Описание
  path: string;                  // Абсолютный путь к файлам
  last_modified: string;         // Дата последнего изменения
  thumbnail_url?: string;        // URL миниатюры
  sub_path?: string;             // Относительный путь в monorepo
  parent_repo?: string;          // Имя родительского monorepo
  repo_url?: string;             // Оригинальный Git URL
  import_type?: "type1" | "type2_subproject";
  parent_repo_path?: string;     // Путь к родительскому репо
}
```

### Комментарии

```typescript
interface Comment {
  id: string;
  project_id: string;
  page: string;                  // Страница (схема/PCB)
  context: "SCH" | "PCB";        // Контекст
  x: number;                     // X координата
  y: number;                     // Y координата
  content: string;               // Текст комментария
  status: "open" | "resolved";   // Статус
  author: string;                // Автор
  created_at: string;            // Дата создания
  replies: CommentReply[];       // Ответы
}

interface CommentReply {
  id: string;
  comment_id: string;
  content: string;
  author: string;
  created_at: string;
}
```

### Конфигурация Путей

```typescript
interface PathConfig {
  schematic?: string;            // Глоб-паттерн для схемы
  pcb?: string;                  // Глоб-паттерн для PCB
  subsheets?: string;            // Папка подсхем
  designOutputs?: string;        // Папка design выходов
  manufacturingOutputs?: string; // Папка manufacturing выходов
  documentation?: string;        // Папка документации
  thumbnail?: string;            // Папка thumbnail
  readme?: string;               // Файл README
  jobset?: string;               // Файл jobset
}
```

### Задачи (Jobs)

```typescript
interface Job {
  id: string;                    // UUID
  status: "running" | "completed" | "failed";
  message: string;               // Сообщение о статусе
  percent: number;               // Процент выполнения (0-100)
  project_id?: string;           // ID проекта
  project_ids?: string[];        // Для мульти-импорта
  error?: string;                // Сообщение об ошибке
  logs: string[];                // Логи выполнения
  type: "import" | "design" | "manufacturing" | "render";
  author?: string;               // Автор workflow
}
```

---

## 🚀 Развёртывание

### Docker Compose (Рекомендуется)

**Структура:**
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./data/projects:/app/projects
      - ./data/ssh:/root/.ssh:rw
    environment:
      - KICAD_PROJECTS_ROOT=/app/projects
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - AUTH_ENABLED=${AUTH_ENABLED:-true}
      - GITHUB_TOKEN=${GITHUB_TOKEN}

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
```

**Команды:**
```bash
# Запуск с OAuth
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com docker compose up -d

# Запуск без авторизации
AUTH_ENABLED=false docker compose up -d

# Просмотр логов
docker logs kicad-prism-backend
docker logs kicad-prism-frontend

# Остановка
docker compose down
```

**Хранение данных:**
- `./data/projects/` — импортированные проекты
- `./data/ssh/` — SSH ключи
- `./data/projects/.project_registry.json` — реестр проектов
- `./data/projects/comments.db` — база комментариев

---

### Локальная Разработка

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Отредактировать .env
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

**Требования:**
- Python 3.10+
- Node.js 18+
- KiCAD 9.0+ (для `kicad-cli`)

---

## 🔐 Безопасность

### Аутентификация
- OAuth 2.0 токены валидируются на backend
- Токены не хранятся, только информация о пользователе
- Сессионные данные в `localStorage` (не httpOnly)

### Git Доступ
- SSH ключи с ограниченным доступом
- GitHub токены с минимальными правами (`repo` scope)
- `GIT_TERMINAL_PROMPT=0` предотвращает интерактивные запросы

### Файловая Безопасность
- Валидация путей для предотвращения directory traversal
- Проверка `os.path.abspath` для всех файловых операций
- Ограничение доступа к файлам в пределах проекта

### CORS
- Для разработки: `allow_origins=["*"]`
- Для продакшена: настроить конкретные origins

---

## 📊 Производительность

### Оптимизации

**Frontend:**
- Кэширование структуры monorepo в памяти (`Map<string, MonorepoStructure>`)
- Дебаунс поиска (150ms)
- Мемоизация Fuse.js экземпляра через `useMemo`
- Ленивая загрузка визуализаторов

**Backend:**
- Кэширование реестра проектов (TTL 5 секунд)
- Асинхронные задачи для долгих операций (клонирование, workflows)
- Потоковая обработка для `kicad-cli` вывода

**Git:**
- Фильтрация коммитов на уровне Git (не post-processing)
- Ограничение количества коммитов (`limit` параметр)
- Использование `diff` для определения изменённых файлов

---

## 🧩 Расширяемость

### Пользовательские Workflows

Пользователи могут добавлять собственные workflow через:
1. Создание скриптов в проекте
2. Модификация `Outputs.kicad_jobset`
3. Определение новых output ID

### Кастомные Поля BOM

Через `.prism.json` можно добавить поля для спецификации:
```json
{
  "bom": {
    "fields": ["Manufacturer", "MPN", "Description"]
  }
}
```

### Плагины KiCAD

**Планируется:** Интеграция комментариев напрямую в KiCAD:
- Чтение `.comments/comments.json` из KiCAD
- Отображение комментариев в редакторе схем/PCB
- Создание комментариев из KiCAD

---

## 📈 Roadmap

### Завершённые Функции
- ✅ Высокопроизводительные просмотрщики схем и PCB
- ✅ Совместные рецензии с комментариями
- ✅ Автоматизированные workflow генерации
- ✅ Визуальное сравнение (kicad-cli интеграция)
- ✅ Гибкая система путей (.prism.json)
- ✅ Поддержка monorepo
- ✅ Нечёткий поиск с подсветкой
- ✅ SQLite хранилище комментариев

### В Разработке
- [ ] Исправление багов ecad-viewer для маленьких проектов
- [ ] Плагин KiCAD для отображения комментариев в редакторе
- [ ] Пользовательские разрешения и роли
- [ ] Collaboration в реальном времени (WebSockets)

### Будущие Улучшения
- [ ] Версионирование комментариев
- [ ] Уведомления об ответах (email/webhook)
- [ ] Экспорт комментариев в PDF
- [ ] Интеграция с Jira/GitHub Issues
- [ ] A/B сравнение PCB с наложением
- [ ] Поиск компонентов по спецификации
- [ ] Генерация 3D PDF из моделей
- [ ] Поддержка множественных языков (i18n)

---

## 💡 Рекомендации Новых Функций (на основе Altium 365)

### 1. **Supply Chain Intelligence** 📦

**Идея из Altium 365:** Интеграция с поставщиками компонентов для отображения доступности и цен.

**Реализация в KiCAD Prism:**
- Парсинг MPN (Manufacturer Part Number) из BOM
- Интеграция с API поставщиков (Digi-Key, Mouser, LCSC, Arrow)
- Отображение в реальном времени:
  - Доступность на складе
  - Цена за единицу
  - Минимальное количество заказа
  - Сроки поставки
- Альтернативные компоненты (cross-reference)
- Уведомления об изменениях статуса

**Техническая реализация:**
```python
# backend/app/services/supply_chain_service.py
async def get_component_availability(mpn: str) -> ComponentData:
    # Параллельные запросы к API поставщиков
    digikey = await digikey_api.search(mpn)
    mouser = await mouser_api.search(mpn)
    lcsc = await lcsc_api.search(mpn)
    
    return aggregate_results(digikey, mouser, lcsc)
```

**UI Компонент:**
- Новая вкладка в Visualizer: "Supply Chain"
- Таблица с компонентами и статусами
- Цветовая индикация (зелёный = в наличии, красный = нет)
- Кнопка "Заказать" с переходом на сайт поставщика

---

### 2. **Design Review Meetings** 🎥

**Идея из Altium 365:** Встроенные видеовстречи для обсуждения проектов.

**Реализация в KiCAD Prism:**
- Интеграция WebRTC для видеосвязи
- Совместный просмотр схем/PCB в реальном времени
- Курсоры всех участников видны одновременно
- Голосовые комментарии с привязкой к координатам
- Запись сессии с экспортом в видео

**Техническая реализация:**
```python
# backend/app/api/meetings.py
@router.post("/meetings/start")
async def start_meeting(project_id: str):
    room_id = generate_room_id()
    # Интеграция с Daily.co или Jitsi
    meeting_url = await webrtc_service.create_room(room_id)
    return {"meeting_url": meeting_url, "room_id": room_id}
```

**UI Компонент:**
- Кнопка "Start Review" в Visualizer
- Боковая панель с участниками
- Чат во время встречи
- Кнопка записи

---

### 3. **PCB Cost Estimation** 💰

**Идея из Altium 365:** Автоматический расчёт стоимости производства платы.

**Реализация в KiCAD Prism:**
- Парсинг параметров PCB из `.kicad_pcb`:
  - Размеры платы
  - Количество слоёв
  - Минимальная ширина дорожки
  - Минимальный диаметр отверстия
  - Покрытие (HASL, ENIG, OSP)
- Интеграция с fab-хабами (JLCPCB, PCBWay, Seeed Studio)
- Мгновенный расчёт стоимости для разных производителей
- Сравнение цен и сроков

**Техническая реализация:**
```python
# backend/app/services/cost_estimator.py
def estimate_pcb_cost(pcb_file: str) -> List[FabQuote]:
    params = parse_pcb_parameters(pcb_file)
    
    quotes = []
    for fab in [JLCPCB, PCBWay, Seeed]:
        quote = fab.api.calculate(
            layers=params.layers,
            size=params.size,
            quantity=5,
            finish=params.finish
        )
        quotes.append(quote)
    
    return sorted(quotes, key=lambda x: x.total_cost)
```

**UI Компонент:**
- Новая секция в "Manufacturing Outputs"
- Карточки с ценами от разных фабрик
- Детальная разбивка стоимости
- Кнопка "Заказать" с экспортом Gerber

---

### 4. **Version Control Visual Timeline** 📅

**Идея из Altium 365:** Визуальная временная шкала изменений проекта.

**Реализация в KiCAD Prism:**
- Интерактивная timeline с коммитами
- Визуальные индикаторы типов изменений:
  - 🟢 Схема изменена
  - 🔵 PCB изменена
  - 🟡 BOM обновлён
  - 🟣 Комментарии добавлены
- Предпросмотр изменений при наведении
- Быстрое переключение между версиями
- Ветвление и слияние (Git branches)

**Техническая реализация:**
```typescript
// frontend/src/components/version-timeline.tsx
interface TimelineEvent {
  commit: string;
  date: Date;
  author: string;
  changes: {
    schematic?: boolean;
    pcb?: boolean;
    bom?: boolean;
    comments?: number; // количество новых комментариев
  };
}

// API endpoint для получения данных
GET /api/projects/{id}/timeline?limit=50
```

**UI Компонент:**
- Горизонтальная timeline с зумом
- Цветовые метки изменений
- Tooltip с деталями при наведении
- Клик → загрузка версии в визуализатор

---

### 5. **Component Lifecycle Management** ⚠️

**Идея из Altium 365:** Отслеживание статуса жизненного цикла компонентов.

**Реализация в KiCAD Prism:**
- Проверка MPN против баз данных производителей
- Статусы:
  - ✅ Active (в производстве)
  - ⚠️ NRND (Not Recommended for New Design)
  - ❌ EOL (End of Life)
  - 🚫 Obsolete (снято с производства)
- Уведомления о предстоящем EOL
- Рекомендации альтернатив
- Отчёт о рисках проекта

**Техническая реализация:**
```python
# backend/app/services/lifecycle_service.py
async def check_lifecycle_status(components: List[Component]) -> LifecycleReport:
    report = LifecycleReport()
    
    for comp in components:
        status = await octopart_api.get_lifecycle(comp.mpn)
        
        if status == "EOL":
            report.at_risk.append(comp)
            alternatives = await find_alternatives(comp)
            report.suggested_replacements[comp.id] = alternatives
    
    return report
```

**UI Компонент:**
- Dashboard widget "Component Health"
- Красные индикаторы для EOL компонентов
- Кнопка "Find Alternatives"
- Экспорт отчёта в PDF

---

### 6. **3D PDF Export** 📄

**Идея из Altium 365:** Экспорт интерактивных 3D моделей в PDF.

**Реализация в KiCAD Prism:**
- Конвертация `.step`/`.glb` в U3D формат
- Вставка в PDF с интерактивностью:
  - Вращение модели
  - Масштабирование
  - Разные ракурсы
- Добавление размеров и аннотаций
- Экспорт спецификации на отдельной странице

**Техническая реализация:**
```python
# backend/app/services/pdf_export_service.py
from reportlab.lib.pagesizes import A4
from PyPDF2 import PdfReader, PdfWriter

def create_3d_pdf(model_path: str, output_path: str):
    # Конвертация в U3D через Blender CLI
    u3d_path = convert_to_u3d(model_path)
    
    # Создание PDF с 3D аннотацией
    pdf = Canvas(output_path, pagesize=A4)
    pdf.acroform.textfield(name='3DView', x=50, y=100, width=500, height=400)
    pdf.embed_3d(u3d_path)
    pdf.save()
```

**UI Компонент:**
- Кнопка "Export 3D PDF" в 3D Viewer
- Настройки экспорта (ракурс, фон)
- Прогресс-бар генерации
- Скачать готовый файл

---

### 7. **Real-time Collaborative Editing** ✏️

**Идея из Altium 365:** Одновременное редактирование несколькими пользователями.

**Реализация в KiCAD Prism:**
- WebSockets для синхронизации в реальном времени
- Операционные трансформации (OT) для конфликтов
- Видимость курсоров других пользователей
- Блокировка объектов при редактировании
- История изменений с возможностью отката

**Техническая реализация:**
```python
# backend/app/websockets/collab.py
from fastapi import WebSocket

class CollaborationManager:
    async def connect(self, websocket: WebSocket, project_id: str):
        await websocket.accept()
        self.rooms[project_id].add(websocket)
        
    async def broadcast_change(self, project_id: str, change: dict):
        # Рассылка изменений всем подключенным
        for ws in self.rooms[project_id]:
            await ws.send_json(change)
```

**UI Компонент:**
- Индикаторы присутствия (аватарки)
- Цветные курсоры с именами
- Панель активных пользователей
- Чат во время редактирования

---

### 8. **Smart BOM Validation** ✅

**Идея из Altium 365:** Автоматическая проверка спецификации на ошибки.

**Реализация в KiCAD Prism:**
- Проверка полноты данных:
  - Заполнены ли все MPN
  - Есть ли ссылки на datasheets
  - Корректность footprint
- Поиск дубликатов компонентов
- Проверка соответствия стандартам IPC
- Валидация против правил компании

**Техническая реализация:**
```python
# backend/app/services/bom_validator.py
class BOMValidator:
    def validate(self, bom: List[Component]) -> ValidationReport:
        errors = []
        warnings = []
        
        for comp in bom:
            if not comp.mpn:
                errors.append(f"Missing MPN for {comp.designator}")
            if not comp.footprint:
                warnings.append(f"Missing footprint for {comp.designator}")
        
        duplicates = self.find_duplicates(bom)
        
        return ValidationReport(errors, warnings, duplicates)
```

**UI Компонент:**
- Вкладка "BOM Validation" в Visualizer
- Список ошибок с фильтрами
- Быстрый переход к компоненту на схеме
- Кнопка "Auto-fix" для простых проблем

---

### 9. **Project Analytics Dashboard** 📊

**Идея из Altium 365:** Метрики и аналитика проекта.

**Реализация в KiCAD Prism:**
- Статистика проекта:
  - Количество компонентов
  - Количество слоёв PCB
  - Площадь платы
  - Количество переходных отверстий
- Активность команды:
  - Коммиты по времени
  - Активные пользователи
  - Открытые комментарии
- Прогресс разработки:
  - Дни до релиза
  - Оставшиеся задачи
  - Статус рецензий

**Техническая реализация:**
```python
# backend/app/api/analytics.py
@router.get("/projects/{id}/analytics")
async def get_project_analytics(project_id: str):
    project = get_project(project_id)
    
    stats = {
        "components": count_components(project.bom),
        "layers": count_layers(project.pcb),
        "area": calculate_area(project.pcb),
        "vias": count_vias(project.pcb),
        "commits": get_commit_count(project.repo),
        "open_comments": count_open_comments(project_id),
    }
    
    return stats
```

**UI Компонент:**
- Dashboard с виджетами
- Графики активности (Chart.js)
- Heatmap коммитов (как GitHub)
- Экспорт отчёта в PDF

---

### 10. **Integration Hub** 🔌

**Идея из Altium 365:** Интеграция с внешними системами.

**Реализация в KiCAD Prism:**
- **GitHub/GitLab:**
  - Pull Request интеграция
  - Статус checks для коммитов
  - Автоматические рецензии
- **Jira:**
  - Создание задач из комментариев
  - Синхронизация статусов
  - Связь коммитов с задачами
- **Slack/Teams:**
  - Уведомления об изменениях
  - Бот для запроса информации
  - Канал проекта
- **CI/CD:**
  - Автоматические тесты при коммите
  - Генерация артефактов
  - Деплой документации

**Техническая реализация:**
```python
# backend/app/services/integrations/github.py
async def create_pr_check(commit_sha: str, status: str, description: str):
    await github_api.post(
        f"/repos/{repo}/statuses/{commit_sha}",
        json={
            "state": status,
            "description": description,
            "context": "KiCAD Prism"
        }
    )

# backend/app/services/integrations/jira.py
async def create_jira_issue(comment: Comment):
    issue = {
        "project": {"key": "HW"},
        "summary": f"Comment on {comment.project}",
        "description": comment.content,
        "issuetype": {"name": "Task"}
    }
    return await jira_api.create_issue(issue)
```

**UI Компонент:**
- Страница настроек интеграций
- OAuth flow для каждого сервиса
- Webhook конфигурация
- Логи интеграций

---

### 11. **Design Rule Check (DRC) Online** ⚙️

**Идея из Altium 365:** Запуск проверки правил проектирования в облаке.

**Реализация в KiCAD Prism:**
- Запуск `kicad-cli pcb drc` на backend
- Настройка правил через UI:
  - Минимальная ширина дорожки
  - Минимальный зазор
  - Размеры переходных отверстий
  - Критические зоны
- Отчёт с визуализацией нарушений
- Экспорт отчёта в HTML/PDF

**Техническая реализация:**
```python
# backend/app/services/drc_service.py
async def run_drc_check(pcb_file: str, rules: DRCRules) -> DRCReport:
    cmd = [
        "kicad-cli", "pcb", "drc",
        "--output", "drc_report.json",
        "--rules", rules.to_json(),
        pcb_file
    ]
    
    result = await subprocess.run(cmd, capture_output=True)
    return parse_drc_report(result.stdout)
```

**UI Компонент:**
- Кнопка "Run DRC" в PCB Viewer
- Настройки правил (модальное окно)
- Список нарушений с навигацией
- Маркеры на PCB для каждого нарушения

---

### 12. **Component Parametric Search** 🔍

**Идея из Altium 365:** Поиск компонентов по параметрам.

**Реализация в KiCAD Prism:**
- Фильтрация компонентов BOM:
  - По типу (R, C, L, IC, etc.)
  - По номиналу
  - По допуску
  - По корпусу
  - По производителю
- Группировка по категориям
- Сравнение компонентов
- Быстрый переход к позиции на схеме

**Техническая реализация:**
```typescript
// frontend/src/components/bom-search.tsx
interface BOMFilter {
  category?: string;
  manufacturer?: string[];
  valueRange?: [number, number];
  footprint?: string[];
  inStock?: boolean;
}

const filteredBOM = useMemo(() => {
  return bom.filter(comp => {
    return matchesFilter(comp, filters);
  });
}, [bom, filters]);
```

**UI Компонент:**
- Боковая панель с фильтрами
- Таблица с сортировкой по колонкам
- Чекбоксы для мультиселекта
- Экспорт отфильтрованного списка

---

## 📝 Заключение

KiCAD Prism — это мощная платформа с современной архитектурой, которая уже предоставляет ключевые функции для совместной работы над KiCAD проектами. Интеграция возможностей из Altium 365 (supply chain, cost estimation, lifecycle management) может значительно расширить функциональность и сделать платформу незаменимым инструментом для команд разработчиков электроники.

**Ключевые преимущества текущей архитектуры:**
- Модульность (легко добавлять новые сервисы)
- Гибкая система путей (поддержка разных структур проектов)
- SQLite для комментариев (простота развёртывания)
- Docker для переносимости
- TypeScript для типобезопасности

**Приоритетные функции для реализации:**
1. **Supply Chain Intelligence** — критично для производства
2. **PCB Cost Estimation** — экономия времени на расчётах
3. **Component Lifecycle** — предотвращение проблем с поставками
4. **Smart BOM Validation** — улучшение качества проектов
5. **Integration Hub** — подключение к существующим workflow

---

*Документ создан: 25 февраля 2026*
*Версия: 1.0*
