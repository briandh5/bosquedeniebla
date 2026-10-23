# Bosque de Niebla · Xalapa

Dashboard interactivo del microclima del bosque mesófilo de montaña de Xalapa, Veracruz, con un **modo aprendizaje** que explica, gráfica por gráfica, el análisis con Pandas y NumPy que hay detrás.

App #7 del reto [101 great ideas](https://github.com/briandh5/101greatideas).

## Qué incluye

- **Mapa de calor de anomalías térmicas** (1990–2025) contra la normal 1990–2019, con tendencia lineal por década.
- **Lluvia y niebla**: precipitación mensual y días con niebla en doble eje, o en paneles separados por década.
- **Lluvias extremas**: histograma por rangos (`pd.cut`) o diagrama de violín (KDE), con umbral ajustable.
- **Filtros por década** (1990s, 2000s, 2010s, 2020s) y tooltips en todas las gráficas.
- **“¿Cómo se hizo en Pandas?”**: panel lateral con código Python estilo editor y resultados que se recalculan con los filtros activos (`groupby`, `pivot_table`, `resample`, `corr`, máscaras booleanas, `pd.cut`, `np.polyfit`).
- Sección para conocer y apoyar al [INECOL](https://www.inecol.mx).
- Tema día / noche.

Los datos son **simulados** con una semilla fija a partir de la climatología típica de Xalapa (14–18 °C, 1,350–1,650 mm al año); no son mediciones oficiales.

## Stack

React 19 · Vite · Tailwind CSS 3 · Recharts · Lucide. Todo vive en un solo componente: `src/BosqueNiebla.jsx`.

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm run build      # build de producción (Vercel detecta Vite solo)
npm run artifact   # un solo HTML autocontenido en dist-artifact/
```
