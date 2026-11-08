import type { ClassicRecipeDef } from './classicRecipes';

/** Bump to refresh installed classics (user-edited/deleted ones are never touched). */
export const CLASSIC_RECIPES_VERSION = 1;

/*
 * Classic Spanish home recipes written for this app. Ingredient lists follow the traditional dish;
 * quantities are typical home amounts for the whole pot, as RAW / DRY weights of the edible part.
 * Frying oil counts only what the food keeps (≈ 10–15 % of the oil used) — see the ingredient note.
 * Salt, water, spices and herbs are left out (negligible energy; sodium from salt is not estimated).
 * `dish` names the measured BEDCA/CIQUAL dish; its lab values remain the default for photos & search.
 */
const ACEITE = 'bedca_2543'; // Aceite de oliva
const AOVE = 'bedca_2544'; // Aceite de oliva virgen extra
const PATATA = 'bedca_2403';
const HUEVO = 'bedca_2127';
const HUEVO_DURO = 'bedca_2126';
const CEBOLLA = 'bedca_2381';
const AJO = 'bedca_2361';
const TOMATE = 'usda_170457';
const TOMATE_TRITURADO = 'usda_170051';
const PIMIENTO_VERDE = 'usda_170427';
const PIMIENTO_ROJO = 'usda_170108';
const ZANAHORIA = 'usda_170393';
const PAN = 'bedca_2160';
const PAN_RALLADO = 'bedca_2171';
const HARINA = 'bedca_2677';
const MAICENA = 'bedca_2644';
const LECHE = 'bedca_2493';
const AZUCAR = 'usda_169655';
const CANELA = 'usda_171320';
const CHORIZO = 'bedca_2264';
const MORCILLA = 'bedca_2280';
const PANCETA = 'bedca_2260';
const TOCINO = 'bedca_2317';
const JAMON_SERRANO = 'bedca_2273';
const POLLO_MUSLO = 'bedca_993';
const ARROZ = 'bedca_2660';
const FRITURA = 'para freír: solo lo que absorbe';

export const CLASSIC_RECIPES: readonly ClassicRecipeDef[] = [
  {
    key: 'tortilla-de-patata', name: 'Tortilla de patata', servings: 4, dish: 'tortilla de patata', mealTypes: ['lunch', 'dinner', 'snack'], tags: ['huevo', 'tapa', 'vegetariana'], prepTimeMinutes: 15, cookTimeMinutes: 30,
    ingredients: [{ food: PATATA, grams: 600 }, { food: HUEVO, grams: 330, note: '6 huevos' }, { food: CEBOLLA, grams: 150 }, { food: ACEITE, grams: 60, note: FRITURA }],
    instructions: ['Pela y corta las patatas y la cebolla en láminas finas.', 'Confítalas en abundante aceite de oliva a fuego medio unos 20 minutos, sin que se doren.', 'Escúrrelas bien y mézclalas con los huevos batidos y sal.', 'Cuaja la mezcla en una sartén con una cucharada de aceite, dale la vuelta con un plato y termina por el otro lado.'],
  },
  {
    key: 'cocido-madrileno', name: 'Cocido madrileño', servings: 6, dish: 'cocido', mealTypes: ['lunch'], tags: ['legumbres', 'cuchara', 'invierno'], prepTimeMinutes: 20, cookTimeMinutes: 180,
    ingredients: [
      { food: 'bedca_1020', grams: 400, note: 'garbanzos secos, en remojo la noche anterior' }, { food: 'bedca_1030', grams: 400, note: 'carne de ternera (morcillo o costilla)' },
      { food: POLLO_MUSLO, grams: 400, note: 'gallina o pollo' }, { food: TOCINO, grams: 100 }, { food: CHORIZO, grams: 150 }, { food: MORCILLA, grams: 150 },
      { food: JAMON_SERRANO, grams: 80, note: 'punta de jamón' }, { food: PATATA, grams: 600 }, { food: ZANAHORIA, grams: 200 }, { food: 'usda_169975', grams: 500, note: 'repollo' },
      { food: 'bedca_1117', grams: 120, note: 'fideos finos para la sopa' }, { food: AJO, grams: 10 }, { food: ACEITE, grams: 15, note: 'para rehogar el repollo' },
    ],
    instructions: ['Pon a cocer las carnes, el tocino y el jamón en agua fría; desespuma al hervir.', 'Añade los garbanzos remojados dentro de una malla y cuece a fuego suave unas 2 horas y media.', 'Cuece aparte el chorizo, la morcilla y el repollo.', 'Añade patatas y zanahorias en la última media hora.', 'Cuela el caldo y cuece en él los fideos: es el primer vuelco.', 'Sirve después los garbanzos con las verduras y, por último, las carnes.'],
  },
  {
    key: 'lentejas-con-chorizo', name: 'Lentejas con chorizo', servings: 4, dish: 'lentejas', mealTypes: ['lunch'], tags: ['legumbres', 'cuchara'], prepTimeMinutes: 15, cookTimeMinutes: 50,
    ingredients: [{ food: 'bedca_1065', grams: 320, note: 'lentejas secas' }, { food: CHORIZO, grams: 120 }, { food: PATATA, grams: 300 }, { food: ZANAHORIA, grams: 120 }, { food: CEBOLLA, grams: 100 }, { food: PIMIENTO_VERDE, grams: 60 }, { food: AJO, grams: 10 }, { food: ACEITE, grams: 30 }],
    instructions: ['Haz un sofrito con aceite, cebolla, pimiento y ajo picados.', 'Añade las lentejas, la zanahoria y el chorizo en rodajas y cubre con agua fría.', 'Cuece a fuego suave unos 30 minutos.', 'Añade la patata troceada y cuece 20 minutos más, hasta que esté tierna.'],
  },
  {
    key: 'fabada-asturiana', name: 'Fabada asturiana', servings: 4, dish: 'fabada', mealTypes: ['lunch'], tags: ['legumbres', 'cuchara', 'invierno'], prepTimeMinutes: 10, cookTimeMinutes: 150,
    ingredients: [{ food: 'bedca_899', grams: 400, note: 'fabes secas, en remojo la noche anterior' }, { food: CHORIZO, grams: 150, note: 'chorizo asturiano' }, { food: MORCILLA, grams: 150, note: 'morcilla asturiana' }, { food: PANCETA, grams: 150, note: 'panceta o lacón' }, { food: ACEITE, grams: 15 }],
    instructions: ['Pon las fabes remojadas en una olla con el compango (chorizo, morcilla y panceta) y cubre con agua fría.', 'Lleva a ebullición, desespuma y baja el fuego al mínimo.', 'Cuece 2–2,5 horas «asustando» las fabes con agua fría un par de veces, sin removerlas.', 'Deja reposar antes de servir.'],
  },
  {
    key: 'paella-valenciana', name: 'Paella valenciana', servings: 4, dish: 'paella', mealTypes: ['lunch'], tags: ['arroz', 'domingo'], prepTimeMinutes: 20, cookTimeMinutes: 45,
    ingredients: [{ food: ARROZ, grams: 320 }, { food: POLLO_MUSLO, grams: 500 }, { food: 'bedca_1162', grams: 400, note: 'conejo' }, { food: 'bedca_2198', grams: 200, note: 'judía verde plana (ferraura)' }, { food: TOMATE, grams: 100, note: 'tomate rallado' }, { food: ACEITE, grams: 60 }, { food: AJO, grams: 5 }],
    instructions: ['Dora bien el pollo y el conejo troceados en el aceite.', 'Añade las judías verdes y rehoga; luego el tomate rallado y el pimentón.', 'Vierte agua (unas 3 veces el volumen de arroz) con azafrán y cuece 20 minutos.', 'Reparte el arroz, cuece 10 minutos a fuego fuerte y 8 a fuego suave sin remover.', 'Deja reposar 5 minutos tapada con un paño.'],
  },
  {
    key: 'paella-de-marisco', name: 'Paella de marisco', servings: 4, mealTypes: ['lunch'], tags: ['arroz', 'marisco'], prepTimeMinutes: 25, cookTimeMinutes: 40,
    ingredients: [{ food: ARROZ, grams: 320 }, { food: 'bedca_817', grams: 300, note: 'gambas (peso sin cáscara ≈ la mitad)' }, { food: 'bedca_2345', grams: 200, note: 'mejillones, solo la carne' }, { food: 'bedca_807', grams: 250, note: 'calamar o sepia' }, { food: TOMATE, grams: 100 }, { food: PIMIENTO_ROJO, grams: 80 }, { food: ACEITE, grams: 60 }, { food: AJO, grams: 10 }],
    instructions: ['Marca las gambas en el aceite y resérvalas.', 'Sofríe el calamar troceado, el pimiento, el ajo y el tomate rallado.', 'Añade el arroz, nácaralo y vierte el caldo de pescado caliente con azafrán.', 'Cuece 18 minutos; coloca las gambas y los mejillones en los últimos 5.', 'Reposa 5 minutos antes de servir.'],
  },
  {
    key: 'gazpacho', name: 'Gazpacho andaluz', servings: 4, dish: 'gazpacho', mealTypes: ['lunch', 'dinner'], tags: ['verano', 'frío', 'vegana'], prepTimeMinutes: 15,
    ingredients: [{ food: TOMATE, grams: 1000, note: 'tomates maduros' }, { food: 'bedca_2407', grams: 150, note: 'pepino' }, { food: PIMIENTO_VERDE, grams: 100 }, { food: CEBOLLA, grams: 50 }, { food: AJO, grams: 5 }, { food: PAN, grams: 50, note: 'pan del día anterior' }, { food: AOVE, grams: 60 }],
    instructions: ['Trocea las verduras y remoja el pan.', 'Tritura todo con el aceite, un chorrito de vinagre y sal hasta que quede fino.', 'Cuela si lo quieres muy suave y enfría al menos 2 horas.'],
  },
  {
    key: 'salmorejo', name: 'Salmorejo cordobés', servings: 4, dish: 'salmorejo', mealTypes: ['lunch', 'dinner'], tags: ['verano', 'frío'], prepTimeMinutes: 15,
    ingredients: [{ food: TOMATE, grams: 1000 }, { food: PAN, grams: 200, note: 'pan de telera o de barra del día anterior' }, { food: AOVE, grams: 100 }, { food: AJO, grams: 5 }, { food: HUEVO_DURO, grams: 60, note: 'para decorar' }, { food: JAMON_SERRANO, grams: 50, note: 'para decorar' }],
    instructions: ['Tritura los tomates y cuélalos.', 'Añade el pan troceado y el ajo, deja que se empape 10 minutos y tritura.', 'Emulsiona añadiendo el aceite en hilo con la batidora.', 'Sirve muy frío con huevo duro y jamón picados.'],
  },
  {
    key: 'ensaladilla-rusa', name: 'Ensaladilla rusa', servings: 4, dish: 'ensaladilla', mealTypes: ['lunch', 'dinner', 'snack'], tags: ['tapa', 'verano'], prepTimeMinutes: 20, cookTimeMinutes: 25,
    ingredients: [{ food: PATATA, grams: 600 }, { food: ZANAHORIA, grams: 150 }, { food: 'bedca_1175', grams: 100, note: 'guisantes' }, { food: HUEVO_DURO, grams: 120 }, { food: 'bedca_2130', grams: 160, note: 'atún en aceite, escurrido' }, { food: 'bedca_2553', grams: 200, note: 'mayonesa' }, { food: 'usda_169094', grams: 40, note: 'aceitunas' }],
    instructions: ['Cuece las patatas, las zanahorias y los guisantes; deja enfriar.', 'Trocea las patatas, la zanahoria y el huevo duro.', 'Mezcla con el atún desmigado y la mayonesa.', 'Decora con aceitunas y sirve fría.'],
  },
  {
    key: 'pisto-manchego', name: 'Pisto manchego', servings: 4, dish: 'pisto', mealTypes: ['lunch', 'dinner'], tags: ['verduras', 'vegana'], prepTimeMinutes: 20, cookTimeMinutes: 45,
    ingredients: [{ food: 'bedca_2376', grams: 500, note: 'calabacín' }, { food: 'bedca_2370', grams: 300, note: 'berenjena' }, { food: PIMIENTO_VERDE, grams: 200 }, { food: PIMIENTO_ROJO, grams: 200 }, { food: CEBOLLA, grams: 250 }, { food: TOMATE, grams: 600 }, { food: ACEITE, grams: 60 }],
    instructions: ['Pocha la cebolla y los pimientos en el aceite a fuego suave.', 'Añade la berenjena y el calabacín en dados y cocina 15 minutos.', 'Incorpora el tomate pelado y troceado y deja que reduzca 20 minutos.', 'Sirve solo o con un huevo frito.'],
  },
  {
    key: 'croquetas-de-jamon', name: 'Croquetas de jamón', servings: 6, mealTypes: ['lunch', 'dinner', 'snack'], tags: ['tapa', 'frito'], prepTimeMinutes: 60, cookTimeMinutes: 20,
    ingredients: [{ food: LECHE, grams: 750 }, { food: HARINA, grams: 90 }, { food: 'bedca_756', grams: 60, note: 'mantequilla' }, { food: JAMON_SERRANO, grams: 120 }, { food: HUEVO, grams: 110, note: 'para rebozar' }, { food: PAN_RALLADO, grams: 100 }, { food: ACEITE, grams: 60, note: FRITURA }],
    instructions: ['Rehoga el jamón picado en la mantequilla, añade la harina y tuéstala 2 minutos.', 'Vierte la leche caliente poco a poco sin dejar de remover hasta tener una bechamel espesa (10–15 min).', 'Enfría la masa en la nevera unas horas.', 'Forma unas 24 croquetas, pásalas por huevo y pan rallado y fríelas en aceite muy caliente.'],
  },
  {
    key: 'croquetas-de-pollo', name: 'Croquetas de pollo', servings: 6, dish: 'croquetas de pollo', mealTypes: ['lunch', 'dinner', 'snack'], tags: ['tapa', 'frito'], prepTimeMinutes: 60, cookTimeMinutes: 20,
    ingredients: [{ food: LECHE, grams: 750 }, { food: HARINA, grams: 90 }, { food: 'bedca_756', grams: 60 }, { food: 'bedca_980', grams: 200, note: 'pollo asado o del cocido, desmigado' }, { food: CEBOLLA, grams: 50 }, { food: HUEVO, grams: 110, note: 'para rebozar' }, { food: PAN_RALLADO, grams: 100 }, { food: ACEITE, grams: 60, note: FRITURA }],
    instructions: ['Pocha la cebolla en la mantequilla, añade el pollo picado y la harina.', 'Añade la leche caliente poco a poco hasta tener una bechamel espesa.', 'Enfría, forma las croquetas, rebózalas en huevo y pan rallado y fríelas.'],
  },
  {
    key: 'pollo-al-ajillo', name: 'Pollo al ajillo', servings: 4, mealTypes: ['lunch', 'dinner'], tags: ['carne'], prepTimeMinutes: 10, cookTimeMinutes: 35,
    ingredients: [{ food: POLLO_MUSLO, grams: 1000, note: 'pollo troceado con hueso (peso de la carne ≈ 70 %)' }, { food: AJO, grams: 30 }, { food: ACEITE, grams: 60 }],
    instructions: ['Dora el pollo salpimentado en el aceite a fuego medio.', 'Añade los ajos laminados y una hoja de laurel cuando el pollo esté casi hecho.', 'Moja con un chorro de vino blanco, deja evaporar y termina a fuego suave tapado 10 minutos.'],
  },
  {
    key: 'albondigas-en-salsa', name: 'Albóndigas en salsa', servings: 4, dish: 'albondigas de ternera con tomate', mealTypes: ['lunch', 'dinner'], tags: ['carne'], prepTimeMinutes: 30, cookTimeMinutes: 35,
    ingredients: [{ food: 'bedca_2680', grams: 500, note: 'carne picada mixta' }, { food: HUEVO, grams: 55 }, { food: PAN_RALLADO, grams: 40 }, { food: AJO, grams: 5 }, { food: HARINA, grams: 30, note: 'para enharinar' }, { food: CEBOLLA, grams: 150 }, { food: TOMATE_TRITURADO, grams: 400 }, { food: ACEITE, grams: 50 }],
    instructions: ['Mezcla la carne con el huevo, el pan rallado, ajo y perejil picados y sal.', 'Forma bolas, enharínalas y dóralas en el aceite; resérvalas.', 'En el mismo aceite sofríe la cebolla y añade el tomate; cocina 15 minutos.', 'Vuelve a poner las albóndigas y cuece todo junto 15 minutos.'],
  },
  {
    key: 'merluza-en-salsa-verde', name: 'Merluza en salsa verde', servings: 4, mealTypes: ['lunch', 'dinner'], tags: ['pescado'], prepTimeMinutes: 10, cookTimeMinutes: 20,
    ingredients: [{ food: 'bedca_2347', grams: 800, note: 'merluza en rodajas' }, { food: 'bedca_2640', grams: 250, note: 'almejas' }, { food: 'bedca_1175', grams: 100, note: 'guisantes' }, { food: AJO, grams: 10 }, { food: HARINA, grams: 15 }, { food: ACEITE, grams: 50 }],
    instructions: ['Dora el ajo picado en el aceite en una cazuela de barro, añade la harina y rehoga.', 'Moja con caldo de pescado y un chorro de vino blanco, con perejil picado.', 'Coloca la merluza y las almejas y cuece 6–8 minutos moviendo la cazuela para ligar la salsa.', 'Añade los guisantes al final.'],
  },
  {
    key: 'bacalao-al-pil-pil', name: 'Bacalao al pil pil', servings: 4, mealTypes: ['lunch', 'dinner'], tags: ['pescado'], prepTimeMinutes: 10, cookTimeMinutes: 25,
    ingredients: [{ food: 'bedca_797', grams: 800, note: 'bacalao desalado' }, { food: ACEITE, grams: 150, note: 'gran parte queda en la salsa' }, { food: AJO, grams: 20 }],
    instructions: ['Dora los ajos laminados (y una guindilla) en el aceite templado y retíralos.', 'Confita el bacalao con la piel hacia arriba a fuego muy suave 5 minutos por lado; retíralo.', 'Liga la gelatina con el aceite moviendo la cazuela en círculos (o con un colador) hasta formar el pil pil.', 'Vuelve a poner el bacalao y los ajos.'],
  },
  {
    key: 'marmitako', name: 'Marmitako', servings: 4, mealTypes: ['lunch'], tags: ['pescado', 'cuchara'], prepTimeMinutes: 20, cookTimeMinutes: 35,
    ingredients: [{ food: 'bedca_2134', grams: 600, note: 'bonito o atún fresco' }, { food: PATATA, grams: 800 }, { food: CEBOLLA, grams: 150 }, { food: PIMIENTO_VERDE, grams: 100 }, { food: PIMIENTO_ROJO, grams: 100 }, { food: TOMATE, grams: 200 }, { food: ACEITE, grams: 40 }],
    instructions: ['Sofríe la cebolla y los pimientos picados, añade el tomate y la carne de pimiento choricero.', 'Añade las patatas «chascadas» y rehoga 2 minutos.', 'Cubre con caldo de pescado y cuece 20–25 minutos.', 'Apaga el fuego, añade el bonito en dados y deja reposar tapado 5 minutos.'],
  },
  {
    key: 'pulpo-a-la-gallega', name: 'Pulpo a la gallega', servings: 4, mealTypes: ['lunch', 'dinner', 'snack'], tags: ['marisco', 'tapa'], prepTimeMinutes: 10, cookTimeMinutes: 45,
    ingredients: [{ food: 'bedca_2471', grams: 1200, note: 'pulpo crudo (pierde casi la mitad al cocer)' }, { food: PATATA, grams: 600, note: 'cachelos' }, { food: AOVE, grams: 60 }],
    instructions: ['«Asusta» el pulpo 3 veces en agua hirviendo y cuécelo 35–45 minutos.', 'Cuece las patatas en la misma agua.', 'Corta el pulpo con tijeras sobre las patatas en rodajas, sobre un plato de madera.', 'Aliña con sal gruesa, pimentón y aceite de oliva virgen extra.'],
  },
  {
    key: 'patatas-bravas', name: 'Patatas bravas', servings: 4, mealTypes: ['snack', 'dinner'], tags: ['tapa', 'frito', 'vegana'], prepTimeMinutes: 15, cookTimeMinutes: 25,
    ingredients: [{ food: PATATA, grams: 800 }, { food: ACEITE, grams: 60, note: FRITURA }, { food: TOMATE_TRITURADO, grams: 200, note: 'para la salsa brava' }, { food: ACEITE, grams: 15, note: 'para la salsa' }, { food: HARINA, grams: 10 }],
    instructions: ['Corta las patatas en dados irregulares y fríelas dos veces: a fuego medio y después fuerte.', 'Para la salsa, tuesta la harina en el aceite con pimentón (dulce y picante), añade el tomate y cocina 10 minutos.', 'Sirve las patatas con la salsa por encima.'],
  },
  {
    key: 'patatas-a-la-riojana', name: 'Patatas a la riojana', servings: 4, mealTypes: ['lunch'], tags: ['cuchara'], prepTimeMinutes: 15, cookTimeMinutes: 40,
    ingredients: [{ food: PATATA, grams: 1000 }, { food: CHORIZO, grams: 200 }, { food: CEBOLLA, grams: 150 }, { food: PIMIENTO_VERDE, grams: 100 }, { food: AJO, grams: 10 }, { food: ACEITE, grams: 40 }],
    instructions: ['Sofríe la cebolla, el pimiento y el ajo; añade el chorizo en rodajas.', 'Agrega las patatas chascadas, el pimentón y la carne de pimiento choricero.', 'Cubre con agua y cuece a fuego suave 30 minutos hasta que el caldo espese.'],
  },
  {
    key: 'huevos-rotos', name: 'Huevos rotos con jamón', servings: 2, mealTypes: ['lunch', 'dinner'], tags: ['huevo', 'frito'], prepTimeMinutes: 10, cookTimeMinutes: 25,
    ingredients: [{ food: PATATA, grams: 400 }, { food: HUEVO, grams: 220, note: '4 huevos' }, { food: JAMON_SERRANO, grams: 80 }, { food: ACEITE, grams: 40, note: FRITURA }],
    instructions: ['Fríe las patatas cortadas en bastones finos a fuego medio hasta que estén tiernas y doradas.', 'Fríe los huevos con puntilla.', 'Pon los huevos sobre las patatas, añade el jamón y rómpelos al servir.'],
  },
  {
    key: 'migas', name: 'Migas', servings: 4, mealTypes: ['lunch', 'breakfast'], tags: ['pan'], prepTimeMinutes: 15, cookTimeMinutes: 30,
    ingredients: [{ food: PAN, grams: 500, note: 'pan duro' }, { food: CHORIZO, grams: 150 }, { food: PANCETA, grams: 150 }, { food: PIMIENTO_VERDE, grams: 100 }, { food: AJO, grams: 20 }, { food: ACEITE, grams: 80 }],
    instructions: ['Corta el pan en dados pequeños, humedécelo con agua y sal y déjalo tapado unas horas.', 'Fríe los ajos, el chorizo, la panceta y el pimiento; resérvalos.', 'Añade el pan al aceite y remueve sin parar 20 minutos hasta que las migas estén sueltas y doradas.', 'Mezcla con lo reservado.'],
  },
  {
    key: 'sopa-de-ajo', name: 'Sopa de ajo castellana', servings: 4, mealTypes: ['lunch', 'dinner'], tags: ['cuchara', 'invierno'], prepTimeMinutes: 10, cookTimeMinutes: 25,
    ingredients: [{ food: PAN, grams: 150, note: 'pan duro en rebanadas' }, { food: AJO, grams: 30 }, { food: HUEVO, grams: 220 }, { food: JAMON_SERRANO, grams: 60 }, { food: ACEITE, grams: 40 }],
    instructions: ['Dora los ajos laminados y el jamón en el aceite.', 'Añade el pan y el pimentón y rehoga sin que se queme.', 'Cubre con agua o caldo y cuece 15 minutos.', 'Escalfa los huevos en la sopa justo antes de servir.'],
  },
  {
    key: 'judias-verdes-con-patatas', name: 'Judías verdes con patatas', servings: 4, mealTypes: ['lunch', 'dinner'], tags: ['verduras', 'vegana'], prepTimeMinutes: 10, cookTimeMinutes: 25,
    ingredients: [{ food: 'bedca_2198', grams: 600 }, { food: PATATA, grams: 400 }, { food: AJO, grams: 10 }, { food: ACEITE, grams: 30 }],
    instructions: ['Cuece las judías verdes y las patatas troceadas en agua con sal unos 20 minutos.', 'Escúrrelas.', 'Sofríe el ajo laminado (y pimentón, si quieres) y riégalo por encima.'],
  },
  {
    key: 'espinacas-con-garbanzos', name: 'Espinacas con garbanzos', servings: 4, mealTypes: ['lunch', 'dinner'], tags: ['legumbres', 'vegana', 'andaluza'], prepTimeMinutes: 10, cookTimeMinutes: 20,
    ingredients: [{ food: 'bedca_861', grams: 500, note: 'espinacas' }, { food: 'bedca_2191', grams: 400, note: 'garbanzos cocidos (bote)' }, { food: PAN, grams: 40 }, { food: AJO, grams: 10 }, { food: ACEITE, grams: 40 }],
    instructions: ['Fríe el pan y los ajos en el aceite y májalos con comino, pimentón y un chorrito de vinagre.', 'Rehoga las espinacas en la misma sartén.', 'Añade los garbanzos y el majado con un poco de agua y cocina 10 minutos.'],
  },
  {
    key: 'potaje-de-vigilia', name: 'Potaje de vigilia', servings: 4, mealTypes: ['lunch'], tags: ['legumbres', 'cuchara', 'pescado'], prepTimeMinutes: 15, cookTimeMinutes: 120,
    ingredients: [{ food: 'bedca_1020', grams: 300, note: 'garbanzos secos, en remojo' }, { food: 'bedca_861', grams: 300, note: 'espinacas' }, { food: 'bedca_797', grams: 300, note: 'bacalao desalado' }, { food: HUEVO_DURO, grams: 120 }, { food: CEBOLLA, grams: 100 }, { food: AJO, grams: 10 }, { food: ACEITE, grams: 40 }],
    instructions: ['Cuece los garbanzos remojados con laurel hasta que estén tiernos (1,5–2 h).', 'Haz un sofrito de cebolla y ajo con pimentón y añádelo.', 'Incorpora las espinacas y el bacalao desmigado y cuece 10 minutos.', 'Sirve con huevo duro picado.'],
  },
  {
    key: 'crema-de-calabacin', name: 'Crema de calabacín', servings: 4, mealTypes: ['lunch', 'dinner'], tags: ['verduras', 'vegana'], prepTimeMinutes: 10, cookTimeMinutes: 25,
    ingredients: [{ food: 'bedca_2376', grams: 1000 }, { food: PATATA, grams: 300 }, { food: CEBOLLA, grams: 150 }, { food: ACEITE, grams: 30 }],
    instructions: ['Pocha la cebolla en el aceite.', 'Añade el calabacín y la patata troceados y cubre justo con agua.', 'Cuece 20 minutos y tritura hasta que quede fina.'],
  },
  {
    key: 'arroz-con-leche', name: 'Arroz con leche', servings: 6, dish: 'arroz con leche', mealTypes: ['snack'], tags: ['postre'], prepTimeMinutes: 5, cookTimeMinutes: 60,
    ingredients: [{ food: ARROZ, grams: 150 }, { food: LECHE, grams: 1500 }, { food: AZUCAR, grams: 150 }, { food: CANELA, grams: 2 }],
    instructions: ['Calienta la leche con una rama de canela y piel de limón.', 'Añade el arroz y cuece a fuego muy suave, removiendo a menudo, unos 50 minutos.', 'Añade el azúcar en los últimos 10 minutos.', 'Sirve frío con canela molida.'],
  },
  {
    key: 'natillas', name: 'Natillas caseras', servings: 6, mealTypes: ['snack'], tags: ['postre'], prepTimeMinutes: 10, cookTimeMinutes: 15,
    ingredients: [{ food: LECHE, grams: 1000 }, { food: HUEVO, grams: 220, note: '4 huevos (o 6 yemas)' }, { food: AZUCAR, grams: 150 }, { food: MAICENA, grams: 30 }, { food: CANELA, grams: 2 }],
    instructions: ['Infusiona la leche con canela y piel de limón.', 'Bate los huevos con el azúcar y la maicena.', 'Añade la leche caliente y cuece a fuego suave sin dejar de remover hasta que espese, sin que hierva.', 'Reparte en cuencos y enfría.'],
  },
  {
    key: 'flan-de-huevo', name: 'Flan de huevo', servings: 6, dish: 'flan de huevo', mealTypes: ['snack'], tags: ['postre'], prepTimeMinutes: 15, cookTimeMinutes: 50,
    ingredients: [{ food: HUEVO, grams: 275, note: '5 huevos' }, { food: LECHE, grams: 500 }, { food: AZUCAR, grams: 150, note: 'incluye el caramelo' }],
    instructions: ['Haz un caramelo con parte del azúcar y cubre el fondo del molde.', 'Bate los huevos con el resto del azúcar y la leche.', 'Vierte en el molde y cuece al baño María a 170 °C unos 45 minutos.', 'Enfría y desmolda.'],
  },
  {
    key: 'crema-catalana', name: 'Crema catalana', servings: 6, dish: 'crema catalana', mealTypes: ['snack'], tags: ['postre'], prepTimeMinutes: 10, cookTimeMinutes: 15,
    ingredients: [{ food: LECHE, grams: 1000 }, { food: HUEVO, grams: 165, note: '6 yemas' }, { food: AZUCAR, grams: 200, note: 'incluye el quemado' }, { food: MAICENA, grams: 30 }, { food: CANELA, grams: 2 }],
    instructions: ['Infusiona la leche con canela y piel de limón.', 'Bate las yemas con el azúcar y la maicena y añade la leche.', 'Cuece removiendo hasta que espese y reparte en cazuelitas.', 'Ya fría, cubre con azúcar y quémala con un quemador.'],
  },
  {
    key: 'torrijas', name: 'Torrijas', servings: 6, mealTypes: ['breakfast', 'snack'], tags: ['postre', 'Semana Santa', 'frito'], prepTimeMinutes: 15, cookTimeMinutes: 20,
    ingredients: [{ food: PAN, grams: 300, note: 'pan de torrijas o de barra del día anterior' }, { food: LECHE, grams: 500 }, { food: HUEVO, grams: 165 }, { food: AZUCAR, grams: 80 }, { food: ACEITE, grams: 60, note: FRITURA }, { food: CANELA, grams: 3 }],
    instructions: ['Infusiona la leche con azúcar, canela y piel de limón y déjala templar.', 'Empapa las rebanadas de pan en la leche.', 'Pásalas por huevo batido y fríelas en aceite caliente.', 'Rebózalas en azúcar con canela.'],
  },
  {
    key: 'ensalada-mixta', name: 'Ensalada mixta', servings: 2, mealTypes: ['lunch', 'dinner'], tags: ['verano', 'ensalada'], prepTimeMinutes: 10,
    ingredients: [{ food: 'bedca_2399', grams: 200, note: 'lechuga' }, { food: TOMATE, grams: 300 }, { food: CEBOLLA, grams: 50 }, { food: 'bedca_2130', grams: 120, note: 'atún en aceite, escurrido' }, { food: HUEVO_DURO, grams: 120 }, { food: 'usda_169094', grams: 30 }, { food: AOVE, grams: 30 }],
    instructions: ['Lava y trocea la lechuga, el tomate y la cebolla.', 'Añade el atún, el huevo duro en cuartos y las aceitunas.', 'Aliña con aceite, vinagre y sal.'],
  },
  {
    key: 'calamares-a-la-romana', name: 'Calamares a la romana', servings: 4, dish: 'calamares a la romana', mealTypes: ['lunch', 'dinner', 'snack'], tags: ['tapa', 'frito', 'marisco'], prepTimeMinutes: 15, cookTimeMinutes: 10,
    ingredients: [{ food: 'bedca_807', grams: 600 }, { food: HARINA, grams: 80 }, { food: HUEVO, grams: 110 }, { food: ACEITE, grams: 60, note: FRITURA }],
    instructions: ['Corta el calamar en anillas y sécalo bien.', 'Pásalo por harina y huevo batido.', 'Fríe en tandas en aceite muy caliente 1–2 minutos y escurre sobre papel.'],
  },
  {
    key: 'gambas-al-ajillo', name: 'Gambas al ajillo', servings: 4, mealTypes: ['snack', 'dinner'], tags: ['tapa', 'marisco'], prepTimeMinutes: 10, cookTimeMinutes: 5,
    ingredients: [{ food: 'bedca_817', grams: 400, note: 'gambas peladas' }, { food: AJO, grams: 30 }, { food: ACEITE, grams: 60, note: 'se toma parte del aceite con pan' }],
    instructions: ['Calienta el aceite en una cazuelita de barro con los ajos laminados y una guindilla.', 'Cuando los ajos empiecen a dorarse, añade las gambas.', 'Cocina 1–2 minutos y sirve chisporroteando, con perejil.'],
  },
  {
    key: 'empanada-gallega-de-atun', name: 'Empanada gallega de atún', servings: 8, mealTypes: ['lunch', 'dinner', 'snack'], tags: ['horno', 'masa'], prepTimeMinutes: 40, cookTimeMinutes: 40,
    ingredients: [{ food: HARINA, grams: 500 }, { food: ACEITE, grams: 100, note: 'para la masa y el sofrito' }, { food: HUEVO, grams: 55, note: 'para pintar' }, { food: 'bedca_2130', grams: 300, note: 'atún en aceite, escurrido' }, { food: CEBOLLA, grams: 400 }, { food: PIMIENTO_ROJO, grams: 200 }, { food: TOMATE_TRITURADO, grams: 200 }],
    instructions: ['Haz una masa con la harina, agua templada, levadura, el aceite del sofrito y sal; deja reposar.', 'Pocha la cebolla y el pimiento, añade el tomate y el pimentón, y mezcla con el atún.', 'Estira dos láminas de masa, rellena, cierra y pinta con huevo.', 'Hornea a 180 °C unos 35–40 minutos.'],
  },
  {
    key: 'pan-con-tomate', name: 'Pan con tomate', servings: 2, mealTypes: ['breakfast', 'snack'], tags: ['desayuno', 'vegana'], prepTimeMinutes: 5,
    ingredients: [{ food: PAN, grams: 160 }, { food: TOMATE, grams: 150 }, { food: AOVE, grams: 20 }, { food: AJO, grams: 3 }],
    instructions: ['Tuesta el pan.', 'Frota con ajo (opcional) y con tomate maduro, o úntalo rallado.', 'Riega con aceite de oliva virgen extra y añade sal.'],
  },
  {
    key: 'arroz-a-la-cubana', name: 'Arroz a la cubana', servings: 2, mealTypes: ['lunch', 'dinner'], tags: ['arroz', 'huevo'], prepTimeMinutes: 5, cookTimeMinutes: 25,
    ingredients: [{ food: ARROZ, grams: 160 }, { food: TOMATE_TRITURADO, grams: 200, note: 'tomate frito casero' }, { food: HUEVO, grams: 110 }, { food: 'usda_173944', grams: 240, note: 'plátano frito (opcional)' }, { food: ACEITE, grams: 30, note: FRITURA }],
    instructions: ['Cuece el arroz blanco con un ajo y escúrrelo.', 'Haz un tomate frito con el tomate y un poco de aceite.', 'Fríe los huevos y el plátano.', 'Sirve el arroz en flan con el tomate, el huevo y el plátano.'],
  },
  {
    key: 'ensalada-de-pimientos-asados', name: 'Pimientos asados', servings: 4, mealTypes: ['lunch', 'dinner'], tags: ['verduras', 'vegana'], prepTimeMinutes: 10, cookTimeMinutes: 50,
    ingredients: [{ food: PIMIENTO_ROJO, grams: 1000 }, { food: AJO, grams: 10 }, { food: AOVE, grams: 40 }],
    instructions: ['Asa los pimientos enteros en el horno a 200 °C unos 45 minutos, dándoles la vuelta.', 'Deja que suden tapados, pélalos y córtalos en tiras.', 'Aliña con su jugo, ajo picado, aceite y sal.'],
  },
  {
    key: 'lomo-con-pimientos', name: 'Lomo con pimientos', servings: 4, mealTypes: ['lunch', 'dinner'], tags: ['carne'], prepTimeMinutes: 10, cookTimeMinutes: 30,
    ingredients: [{ food: 'bedca_2259', grams: 600, note: 'lomo de cerdo en filetes' }, { food: PIMIENTO_VERDE, grams: 300 }, { food: PIMIENTO_ROJO, grams: 200 }, { food: AJO, grams: 10 }, { food: ACEITE, grams: 40 }],
    instructions: ['Fríe los pimientos en tiras a fuego suave hasta que estén blandos.', 'Haz el lomo a la plancha con un poco de sal.', 'Sirve el lomo con los pimientos y su ajo.'],
  },
  {
    key: 'boquerones-en-vinagre', name: 'Boquerones en vinagre', servings: 4, mealTypes: ['snack', 'dinner'], tags: ['tapa', 'pescado'], prepTimeMinutes: 20,
    ingredients: [{ food: 'bedca_2316', grams: 500, note: 'boquerones limpios en filetes' }, { food: AJO, grams: 10 }, { food: AOVE, grams: 60 }],
    instructions: ['Congela los boquerones limpios al menos 5 días (anisakis) y descongélalos.', 'Cúbrelos con vinagre y sal en la nevera 4–6 horas.', 'Escúrrelos y aliña con aceite, ajo y perejil picados.'],
  },
];
