// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// Served from GitHub Pages under the repository name. A custom domain later
// only changes `site` and `base` (and adds public/CNAME).
export default defineConfig({
	site: 'https://krishna-swaroop.github.io',
	base: '/KiCAD-Prism',
	integrations: [
		starlight({
			title: 'KiCAD Prism',
			description: 'Browser review, release and library management for KiCad projects in Git.',
			logo: { src: './src/assets/logo.svg', alt: 'KiCAD Prism' },
			favicon: '/favicon.svg',
			components: {
				Hero: './src/components/Hero.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
				Search: './src/components/Search.astro',
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/krishna-swaroop/KiCAD-Prism' },
			],
			editLink: { baseUrl: 'https://github.com/krishna-swaroop/KiCAD-Prism/edit/dev/website/' },
			lastUpdated: true,
			customCss: ['@fontsource-variable/inter', '@fontsource-variable/geist-mono', './src/styles/prism.css'],
			plugins: [starlightLinksValidator({ errorOnRelativeLinks: false, errorOnLocalLinks: false })],
			sidebar: [
				{ label: 'Get started', items: [{ autogenerate: { directory: 'get-started' } }] },
				{ label: 'Use Prism', items: [{ autogenerate: { directory: 'use' } }] },
				{ label: 'Administer', items: [{ autogenerate: { directory: 'admin' } }] },
				{ label: 'Automate', items: [{ autogenerate: { directory: 'automate' } }] },
				{ label: 'Contribute', items: [{ autogenerate: { directory: 'contribute' } }] },
				{
					label: 'Release notes',
					link: 'https://github.com/krishna-swaroop/KiCAD-Prism/releases',
					attrs: { target: '_blank' },
				},
			],
		}),
	],
});
