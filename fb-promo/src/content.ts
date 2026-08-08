import type { GroupConfig } from './config.js';

// Rotación de contenido: elige un enlace del grupo y una plantilla que no
// haya usado recientemente, y rellena los placeholders.

export interface GeneratedPost {
	text: string;
	templateIndex: number;
	link: string;
}

export function generatePost(group: GroupConfig, templates: string[], recentTemplateIndices: number[]): GeneratedPost {
	const entry = group.links[Math.floor(Math.random() * group.links.length)] ?? group.links[0]!;
	// El distrito del copy sigue al enlace elegido (p. ej. enlace regional => Apurímac)
	const district = entry.district ?? group.district;

	// Evita repetir las últimas plantillas usadas en este grupo.
	const unused = templates
		.map((_, i) => i)
		.filter((i) => !recentTemplateIndices.includes(i));
	const pool = unused.length > 0 ? unused : templates.map((_, i) => i);
	const templateIndex = pool[Math.floor(Math.random() * pool.length)]!;

	const text = templates[templateIndex]!
		.split('{distrito}').join(district)
		.split('{enlace}').join(entry.url);

	return { text, templateIndex, link: entry.url };
}
