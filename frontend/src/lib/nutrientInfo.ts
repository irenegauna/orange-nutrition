import type { MicronutrientKey } from '@/core/types'

/**
 * Plain-language "what it is / what it does" for each nutrient.
 * Benefits are worded from the official Spanish text of the EU's authorised health claims
 * (Reglamento (UE) n.º 432/2012), simplified;
 * limits follow EFSA/EU advice. Short on purpose — this is orientation, not medical advice.
 */
export interface NutrientAbout {
  /** One short line for lists. */
  short: string
  /** What it does, 1–2 plain sentences. */
  does: string
  /** Where to find it (or where it mostly comes from, for limits). */
  foods: string
}

export const NUTRIENT_INFO: Record<MicronutrientKey, NutrientAbout> = {
  vitaminA: { short: 'Vista, piel y defensas', does: 'Ayuda a mantener la vista y la piel en buen estado y a que tu sistema inmunitario funcione con normalidad.', foods: 'Zanahoria, boniato, espinacas, huevos, lácteos' },
  vitaminC: { short: 'Defensas y absorción del hierro', does: 'Ayuda a tus defensas, a formar colágeno para la piel y las encías, mejora la absorción del hierro y ayuda a disminuir el cansancio.', foods: 'Pimiento, cítricos, kiwi, fresas, brócoli' },
  vitaminD: { short: 'Huesos, músculos y defensas', does: 'La “vitamina del sol”: ayuda a absorber el calcio y a mantener huesos, dientes y músculos en buen estado, y a que tus defensas funcionen bien.', foods: 'Pescado azul, huevos, alimentos enriquecidos… y el sol sobre la piel' },
  vitaminE: { short: 'Protege tus células', does: 'Un antioxidante que ayuda a proteger tus células frente al daño oxidativo.', foods: 'Frutos secos, semillas, aceite de oliva, aguacate' },
  vitaminK: { short: 'Coagulación y huesos', does: 'Permite que la sangre coagule con normalidad cuando te haces un corte y ayuda a mantener los huesos.', foods: 'Verduras de hoja verde, brócoli, aceite de oliva' },
  thiamin: { short: 'Convierte la comida en energía', does: 'Ayuda a obtener energía de lo que comes y a que tu corazón y tu sistema nervioso funcionen con normalidad.', foods: 'Cereales integrales, legumbres, cerdo, semillas' },
  riboflavin: { short: 'Energía, piel y vista', does: 'Ayuda a obtener energía de los alimentos, a mantener la piel y la vista en buen estado y a disminuir el cansancio.', foods: 'Leche, yogur, huevos, almendras, champiñones' },
  niacin: { short: 'Energía, nervios y piel', does: 'Ayuda a obtener energía de los alimentos, al buen funcionamiento del sistema nervioso y a mantener la piel; disminuye el cansancio.', foods: 'Pollo, pescado, cacahuetes, cereales integrales' },
  pantothenicAcid: { short: 'Energía y concentración', does: 'Ayuda a obtener energía de los alimentos y contribuye al rendimiento intelectual normal.', foods: 'Está en casi todos los alimentos: huevos, champiñones, aguacate, cereales integrales' },
  vitaminB6: { short: 'Proteínas, sangre y nervios', does: 'Ayuda a aprovechar las proteínas, a formar glóbulos rojos y al buen funcionamiento de los nervios y las defensas; disminuye el cansancio.', foods: 'Pescado, aves, garbanzos, plátano, patata' },
  biotin: { short: 'Energía, pelo y piel', does: 'Ayuda a obtener energía de los alimentos y a mantener el pelo y la piel en buen estado.', foods: 'Huevos, frutos secos, semillas, legumbres' },
  folate: { short: 'Nuevas células y sangre', does: 'Ayuda en la división celular y en la formación de células sanguíneas. Durante el embarazo contribuye al crecimiento de los tejidos de la madre.', foods: 'Verduras de hoja verde, legumbres, espárragos, naranjas' },
  vitaminB12: { short: 'Sangre, nervios y energía', does: 'Necesaria para formar glóbulos rojos y para el buen funcionamiento del sistema nervioso; disminuye el cansancio. Casi solo está en alimentos de origen animal: si eres vegano/a, necesitas alimentos enriquecidos o un suplemento.', foods: 'Pescado, carne, huevos, lácteos, bebidas vegetales enriquecidas' },
  calcium: { short: 'Huesos y dientes', does: 'Necesario para mantener los huesos y los dientes, y ayuda a que músculos y nervios funcionen con normalidad.', foods: 'Leche, yogur, queso, tofu, almendras, sardinas' },
  iron: { short: 'Lleva el oxígeno por tu sangre', does: 'Ayuda al transporte de oxígeno por el cuerpo y a disminuir el cansancio. Tómalo junto con vitamina C para absorber más.', foods: 'Carne roja, lentejas, garbanzos, espinacas, cereales enriquecidos' },
  magnesium: { short: 'Músculos, nervios y energía', does: 'Ayuda a que músculos y nervios funcionen con normalidad, a mantener los huesos y a disminuir el cansancio.', foods: 'Frutos secos, semillas, cereales integrales, legumbres, chocolate negro' },
  phosphorus: { short: 'Huesos y energía', does: 'Ayuda a mantener los huesos y los dientes y a que tus células obtengan energía.', foods: 'Lácteos, carne, pescado, legumbres, frutos secos' },
  potassium: { short: 'Músculos y tensión arterial', does: 'Ayuda a que músculos y nervios funcionen con normalidad y a mantener una tensión arterial normal.', foods: 'Fruta y verdura, patata, alubias, plátano' },
  sodium: { short: 'Mejor poco: viene sobre todo de la sal', does: 'Tu cuerpo necesita un poco, pero tomar menos sodio ayuda a mantener una tensión arterial normal. La mayor parte viene de la sal y de los alimentos procesados.', foods: 'Sal, pan, embutidos, queso, platos preparados, aperitivos salados' },
  zinc: { short: 'Defensas, piel y pelo', does: 'Ayuda a tus defensas, a mantener la piel, el pelo y las uñas, y a la fertilidad normal.', foods: 'Carne, marisco, legumbres, semillas, frutos secos' },
  selenium: { short: 'Protege tus células y el tiroides', does: 'Ayuda a proteger tus células, a que el tiroides y las defensas funcionen con normalidad y a mantener el pelo y las uñas.', foods: 'Nueces de Brasil, pescado, huevos, cereales integrales' },
  copper: { short: 'Hierro y defensas', does: 'Ayuda a transportar el hierro por el cuerpo, a tus defensas y a la pigmentación normal de la piel y el pelo.', foods: 'Frutos secos, semillas, marisco, cereales integrales, chocolate negro' },
  manganese: { short: 'Huesos y energía', does: 'Ayuda a mantener los huesos, a obtener energía de los alimentos y a proteger tus células.', foods: 'Cereales integrales, frutos secos, legumbres, té' },
  iodine: { short: 'Tiroides y metabolismo', does: 'Necesario para producir las hormonas tiroideas, que regulan tu metabolismo, y contribuye a la función cognitiva normal.', foods: 'Sal yodada, pescado, marisco, lácteos, huevos' },
  sugar: { short: 'Mejor pocos azúcares añadidos', does: 'Una fuente rápida de energía. En exceso —sobre todo los azúcares añadidos y los refrescos— aporta calorías sin nutrientes y perjudica a los dientes.', foods: 'Dulces, refrescos, bollería; azúcares naturales de la fruta y la leche' },
  saturatedFat: { short: 'Mejor poca, por tu corazón', does: 'Tomar menos grasas saturadas ayuda a mantener niveles normales de colesterol en sangre. La EFSA aconseja tomar la menor cantidad posible dentro de una dieta equilibrada.', foods: 'Mantequilla, carne grasa, embutidos, queso, bollería, aceites de coco y de palma' },
}

export const MACRO_INFO = {
  calories: { does: 'La energía que tu cuerpo usa para respirar, pensar, moverse y mantener la temperatura.' },
  protein: { does: 'Ayuda a aumentar y conservar la masa muscular y a mantener los huesos en buen estado.', foods: 'Carne, pescado, huevos, lácteos, legumbres, tofu' },
  carbs: { does: 'Son el principal combustible del cuerpo: ayudan a mantener la función cerebral normal y a recuperar los músculos tras un ejercicio intenso. Elige integrales cuando puedas.', foods: 'Pan, pasta, arroz, patata, fruta, legumbres' },
  fat: { does: 'Aporta energía, ayuda a absorber las vitaminas A, D, E y K y contiene grasas esenciales que tu cuerpo no puede fabricar.', foods: 'Aceite de oliva, frutos secos, semillas, aguacate, pescado azul' },
  fiber: { does: 'Ayuda al tránsito intestinal: la fibra de cereales como el salvado de trigo, la avena o la cebada aumenta el volumen de las heces.', foods: 'Cereales integrales, legumbres, fruta, verdura, frutos secos' },
} as const
