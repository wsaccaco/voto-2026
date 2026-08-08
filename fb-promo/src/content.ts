import type { GroupConfig } from './config.js';

// Rotación de contenido: elige un enlace del grupo y una plantilla que no
// haya usado recientemente, y rellena los placeholders.

export interface GeneratedPost {
	text: string;
	templateIndex: number;
	link: string;
}

export function generatePost(group: GroupConfig, templates: string[], recentTemplateIndices: number[]): GeneratedPost {
	const link = group.links[Math.floor(Math.random() * group.links.length)] ?? group.links[0]!;

	// Evita repetir las últimas plantillas usadas en este grupo.
	const unused = templates
		.map((_, i) => i)
		.filter((i) => !recentTemplateIndices.includes(i));
	const pool = unused.length > 0 ? unused : templates.map((_, i) => i);
	const templateIndex = pool[Math.floor(Math.random() * pool.length)]!;

	const text = templates[templateIndex]!
		.split('{distrito}').join(group.district)
		.split('{enlace}').join(link);

	return { text, templateIndex, link };
}
