import * as d3 from 'd3';
import './styles.css';

const nodeColors = {
  Person: '#4c78a8',
  Product: '#f58518',
  Document: '#54a24b',
  Financial: '#b279a2',
  Country: '#e45756',
  Unknown: '#9d9da3',
};

const edgeColors = {
  0: '#5470c6',
  1: '#91cc75',
  2: '#fac858',
  3: '#ee6666',
  4: '#73c0de',
  5: '#b279a2',
  6: '#fc8452',
};

const layers = [
  { key: 'all', label: 'All edges' },
  { key: 'communication', label: 'Email + Phone' },
  { key: 'travel', label: 'Travel' },
  { key: 'financial', label: 'Financial' },
  { key: 'procurement', label: 'Buy + Sell' },
];

const graphOrder = ['Template', 'Q1-Graph1', 'Q1-Graph2', 'Q1-Graph3', 'Q1-Graph4', 'Q1-Graph5'];

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function appShell(data) {
  const app = d3.select('#app');
  app.html(`
    <section class="hero">
      <p class="eyebrow">VAST 2020 Mini-Challenge 1</p>
      <h1>GraphletMatchMaker D3 Visual Analytics</h1>
      <p class="lede">Interactive recreations of the paper's visual workflow: node-link structure, graphlet frequencies, temporal profiles, profile matching, and candidate ranking.</p>
      <div class="hero-grid">
        <div><span class="metric">${data.graphs.length}</span><span>graphs compared</span></div>
        <div><span class="metric">${data.ranking[0].graph}</span><span>best candidate</span></div>
        <div><span class="metric">${fmt(data.ranking[0].score)}</span><span>combined distance</span></div>
      </div>
    </section>
    <section class="controls card">
      <label>Candidate graph
        <select id="candidate-select">
          ${data.graphs.filter((graph) => graph.name !== 'Template').map((graph) => `<option value="${graph.name}" ${graph.name === data.ranking[0].graph ? 'selected' : ''}>${graph.name}</option>`).join('')}
        </select>
      </label>
      <label>Edge layer
        <select id="edge-filter">
          <option value="all">All edge types</option>
          <option value="0,1">Communication only</option>
          <option value="5">Financial only</option>
          <option value="6">Travel only</option>
          <option value="2,3">Procurement only</option>
        </select>
      </label>
      <p>Use the controls to compare the template against one candidate, mirroring the paper's paired visual analysis.</p>
    </section>
    <section class="grid two">
      <div class="card"><h2>Node-Link Diagram View</h2><p>Node color encodes node type; edge color encodes eType. This recreates Fig. 1's side-by-side graph comparison.</p><div id="node-link"></div></div>
      <div class="card"><h2>Candidate Ranking</h2><p>Lower combined normalized distance is better. The score combines graphlets, temporal profiles, financial/profile shape, travel, and procurement.</p><div id="ranking"></div></div>
    </section>
    <section class="grid two">
      <div class="card"><h2>Graphlet Frequency View</h2><p>Communication graphlets from person-to-person Email and Phone edges, normalized per graph.</p><div id="graphlets"></div></div>
      <div class="card"><h2>Temporal Profile View</h2><p>Daily activity counts by layer. The table reports best lag and cosine distance to the template.</p><div id="temporal"></div></div>
    </section>
    <section class="grid two">
      <div class="card"><h2>Node/Profile Matching View</h2><p>Heatmap of PDF-inspired distances. Darker/lower cells indicate closer matches to the template.</p><div id="profile"></div></div>
      <div class="card"><h2>Seed Edge Inspection</h2><p>Q2 seed edges and where their endpoints appear in the candidate subsets.</p><div id="seeds"></div></div>
    </section>
    <section class="card"><h2>Structural Diagnostics</h2><div id="diagnostics"></div></section>
  `);
}

function graphByName(data, name) {
  return data.graphs.find((graph) => graph.name === name);
}

function selectedETypes() {
  const value = d3.select('#edge-filter').property('value');
  if (value === 'all') return null;
  return new Set(value.split(',').map(Number));
}

function drawNodeLink(data, candidateName) {
  const container = d3.select('#node-link').html('');
  const wrap = container.append('div').attr('class', 'node-link-wrap');
  const filter = selectedETypes();
  [graphByName(data, 'Template'), graphByName(data, candidateName)].forEach((graph) => {
    const panel = wrap.append('div').attr('class', 'mini-graph');
    panel.append('h3').text(graph.name);
    const width = 430;
    const height = 360;
    const svg = panel.append('svg').attr('viewBox', [0, 0, width, height]).attr('role', 'img');
    const edges = graph.edges.filter((edge) => !filter || filter.has(edge.eType));
    const activeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
    const nodes = graph.nodes.filter((node) => activeIds.has(node.id));
    const degree = new Map(nodes.map((node) => [node.id, 0]));
    edges.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    });

    const simulation = d3.forceSimulation(nodes.map((node) => ({ ...node })))
      .force('link', d3.forceLink(edges.map((edge) => ({ ...edge }))).id((d) => d.id).distance((d) => d.eType === 5 ? 52 : 82).strength(0.55))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d) => 5 + Math.sqrt(degree.get(d.id) || 1)))
      .stop();
    for (let i = 0; i < 240; i += 1) simulation.tick();

    svg.append('g')
      .attr('stroke-opacity', 0.35)
      .selectAll('line')
      .data(simulation.force('link').links())
      .join('line')
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y)
      .attr('stroke', (d) => edgeColors[d.eType] || '#999')
      .attr('stroke-width', (d) => d.eType === 5 ? 0.8 : 1.5);

    const node = svg.append('g')
      .selectAll('circle')
      .data(simulation.nodes())
      .join('circle')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('r', (d) => 4 + Math.sqrt(degree.get(d.id) || 1) * 1.15)
      .attr('fill', (d) => nodeColors[d.typeLabel] || nodeColors.Unknown)
      .attr('stroke', '#172033')
      .attr('stroke-width', 0.7);
    node.append('title').text((d) => `${d.id}\n${d.typeLabel}\ndegree ${degree.get(d.id) || 0}`);

    panel.append('div').attr('class', 'microstats').html(`
      <span>${nodes.length} visible nodes</span>
      <span>${edges.length} visible edges</span>
      <span>${graph.summary.communicationNodes} comm. nodes</span>
      <span>${graph.summary.communicationEdges} comm. edges</span>
    `);
  });
  drawLegend(container);
}

function drawLegend(container) {
  const legend = container.append('div').attr('class', 'legend');
  legend.append('strong').text('Node types');
  Object.entries(nodeColors).forEach(([label, color]) => {
    legend.append('span').html(`<i style="background:${color}"></i>${label}`);
  });
  legend.append('strong').text('Edge types');
  Object.entries(edgeColors).forEach(([etype, color]) => {
    legend.append('span').html(`<i style="background:${color}"></i>${etype}: ${etypeLabel(etype)}`);
  });
}

function etypeLabel(etype) {
  const labels = { 0: 'Email', 1: 'Phone', 2: 'Sell', 3: 'Buy', 4: 'Author', 5: 'Financial', 6: 'Travel' };
  return labels[etype] || etype;
}

function drawRanking(data) {
  const container = d3.select('#ranking').html('');
  const width = 620;
  const height = 330;
  const margin = { top: 20, right: 30, bottom: 45, left: 90 };
  const svg = container.append('svg').attr('viewBox', [0, 0, width, height]);
  const rows = data.ranking;
  const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.score) * 1.08]).range([margin.left, width - margin.right]);
  const y = d3.scaleBand().domain(rows.map((d) => d.graph)).range([margin.top, height - margin.bottom]).padding(0.28);
  svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(5));
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
  svg.selectAll('rect').data(rows).join('rect')
    .attr('x', margin.left)
    .attr('y', (d) => y(d.graph))
    .attr('width', (d) => x(d.score) - margin.left)
    .attr('height', y.bandwidth())
    .attr('rx', 8)
    .attr('fill', (d, i) => i === 0 ? '#2ca25f' : '#6baed6');
  svg.selectAll('text.score').data(rows).join('text')
    .attr('class', 'score')
    .attr('x', (d) => x(d.score) + 8)
    .attr('y', (d) => y(d.graph) + y.bandwidth() / 2 + 4)
    .text((d) => fmt(d.score));
}

function drawGraphlets(data, candidateName) {
  const container = d3.select('#graphlets').html('');
  const graphs = [graphByName(data, 'Template'), graphByName(data, candidateName)];
  const keys = Array.from(new Set(graphs.flatMap((graph) => Object.keys(graph.graphlets)))).sort();
  const normalized = graphs.map((graph) => {
    const total = d3.sum(Object.values(graph.graphlets));
    return { name: graph.name, values: keys.map((key) => ({ key, value: total ? (graph.graphlets[key] || 0) / total : 0 })) };
  });

  const width = 700;
  const height = 280;
  const margin = { top: 25, right: 20, bottom: 65, left: 90 };
  const svg = container.append('svg').attr('viewBox', [0, 0, width, height]);
  const x = d3.scaleBand().domain(keys).range([margin.left, width - margin.right]).padding(0.18);
  const y = d3.scaleBand().domain(graphs.map((g) => g.name)).range([margin.top, height - margin.bottom]).padding(0.25);
  const color = d3.scaleSequential(d3.interpolateYlOrBr).domain([0, d3.max(normalized.flatMap((row) => row.values), (d) => d.value) || 1]);

  svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x)).selectAll('text').attr('transform', 'rotate(-35)').style('text-anchor', 'end');
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
  svg.selectAll('g.row')
    .data(normalized)
    .join('g')
    .selectAll('rect')
    .data((row) => row.values.map((cell) => ({ ...cell, graph: row.name })))
    .join('rect')
    .attr('x', (d) => x(d.key))
    .attr('y', (d) => y(d.graph))
    .attr('width', x.bandwidth())
    .attr('height', y.bandwidth())
    .attr('rx', 5)
    .attr('fill', (d) => color(d.value))
    .append('title')
    .text((d) => `${d.graph} ${d.key}: ${fmt(d.value)}`);

  const comparison = data.comparison.find((row) => row.graph === candidateName);
  container.append('p').attr('class', 'callout').html(`Graphlet L1 distance to template: <strong>${fmt(comparison.graphletDistance)}</strong>. Lower is closer.`);
}

function drawTemporal(data, candidateName) {
  const container = d3.select('#temporal').html('');
  const template = graphByName(data, 'Template');
  const candidate = graphByName(data, candidateName);
  const comparison = data.comparison.find((row) => row.graph === candidateName);
  const width = 760;
  const rowHeight = 110;
  const margin = { top: 18, right: 30, bottom: 28, left: 92 };
  const svg = container.append('svg').attr('viewBox', [0, 0, width, rowHeight * layers.length + margin.bottom]);
  const x = d3.scaleLinear().domain([0, 365]).range([margin.left, width - margin.right]);

  layers.forEach((layer, i) => {
    const yOffset = i * rowHeight;
    const t = template.daily[layer.key];
    const c = candidate.daily[layer.key];
    const y = d3.scaleLinear().domain([0, d3.max([...t, ...c]) || 1]).nice().range([yOffset + rowHeight - 30, yOffset + margin.top]);
    const line = d3.line().x((_, idx) => x(idx)).y((d) => y(d)).curve(d3.curveStepAfter);
    svg.append('text').attr('x', 8).attr('y', yOffset + 25).attr('class', 'layer-label').text(layer.label);
    svg.append('path').datum(t).attr('d', line).attr('fill', 'none').attr('stroke', '#111827').attr('stroke-width', 2.2);
    svg.append('path').datum(c).attr('d', line).attr('fill', 'none').attr('stroke', '#e45756').attr('stroke-width', 1.8).attr('opacity', 0.85);
    svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(3)).call((g) => g.select('.domain').remove());
    svg.append('line').attr('x1', margin.left).attr('x2', width - margin.right).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', '#d7dce7');
    const metric = comparison.temporal[layer.key];
    svg.append('text').attr('x', width - margin.right - 170).attr('y', yOffset + 22).attr('class', 'mini-note').text(`lag ${metric.lag}d · dist ${fmt(metric.distance)}`);
  });
  svg.append('g').attr('transform', `translate(0,${rowHeight * layers.length - 30})`).call(d3.axisBottom(x).ticks(8));
  container.append('div').attr('class', 'inline-legend').html('<span class="black"></span>Template <span class="red"></span>Candidate');
}

function drawProfiles(data, candidateName) {
  const container = d3.select('#profile').html('');
  const candidates = data.comparison.filter((row) => row.graph !== 'Template');
  const metrics = [
    ['graphletDistance', 'Graphlet'],
    ['temporal.communication.distance', 'Comm. time'],
    ['temporal.travel.distance', 'Travel time'],
    ['profileDistances.financialShape', 'Financial'],
    ['profileDistances.buyShape', 'Buy'],
    ['profileDistances.sellShape', 'Sell'],
    ['profileDistances.personFinancial', 'Person fin.'],
    ['profileDistances.personTravel', 'Person travel'],
  ];
  const get = (row, path) => path.split('.').reduce((cur, key) => cur[key], row);
  const values = candidates.flatMap((row) => metrics.map(([path]) => get(row, path)));
  const color = d3.scaleSequential(d3.interpolateBlues).domain([d3.max(values), d3.min(values)]);
  const width = 760;
  const height = 290;
  const margin = { top: 35, right: 20, bottom: 40, left: 92 };
  const svg = container.append('svg').attr('viewBox', [0, 0, width, height]);
  const x = d3.scaleBand().domain(metrics.map((m) => m[1])).range([margin.left, width - margin.right]).padding(0.08);
  const y = d3.scaleBand().domain(candidates.map((row) => row.graph)).range([margin.top, height - margin.bottom]).padding(0.08);
  svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x)).selectAll('text').attr('transform', 'rotate(-25)').style('text-anchor', 'end');
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
  svg.selectAll('rect')
    .data(candidates.flatMap((row) => metrics.map(([path, label]) => ({ graph: row.graph, label, value: get(row, path) }))))
    .join('rect')
    .attr('x', (d) => x(d.label))
    .attr('y', (d) => y(d.graph))
    .attr('width', x.bandwidth())
    .attr('height', y.bandwidth())
    .attr('rx', 5)
    .attr('fill', (d) => color(d.value))
    .attr('stroke', (d) => d.graph === candidateName ? '#172033' : 'none')
    .attr('stroke-width', 2)
    .append('title')
    .text((d) => `${d.graph} ${d.label}: ${fmt(d.value)}`);
}

function drawSeeds(data) {
  const container = d3.select('#seeds').html('');
  const table = container.append('table').attr('class', 'data-table');
  table.append('thead').html('<tr><th>Seed</th><th>Edge</th><th>Types</th><th>Found in Q1</th></tr>');
  const rows = table.append('tbody').selectAll('tr').data(data.seeds).join('tr');
  rows.html((d) => `
    <td>${d.seed}</td>
    <td>${d.source} → ${d.target}<br><span>${d.eType}: ${d.label}, weight ${fmt(d.weight, 2)}</span></td>
    <td>${d.sourceType} → ${d.targetType}</td>
    <td>edge: ${d.edgeIn.join(', ') || 'none'}<br>source: ${d.sourceIn.join(', ') || 'none'}<br>target: ${d.targetIn.join(', ') || 'none'}</td>
  `);
}

function drawDiagnostics(data, candidateName) {
  const container = d3.select('#diagnostics').html('');
  const rows = [graphByName(data, 'Template'), graphByName(data, candidateName)];
  const table = container.append('table').attr('class', 'data-table');
  table.append('thead').html('<tr><th>Metric</th><th>Template</th><th>Candidate</th></tr>');
  const metrics = [
    ['nodes', 'Nodes'], ['edges', 'Edges'], ['density', 'Density'], ['weakComponents', 'Weak components'], ['largestComponent', 'Largest component'],
    ['duplicateRelations', 'Repeated relations'], ['negativeTimeRows', 'Negative time rows'], ['day365Rows', 'Day 365 rows'], ['negativeWeightRows', 'Negative weights'],
    ['communicationNodes', 'Communication nodes'], ['communicationEdges', 'Communication edges'],
  ];
  table.append('tbody').selectAll('tr').data(metrics).join('tr')
    .html(([key, label]) => `<td>${label}</td><td>${formatMetric(rows[0].summary[key])}</td><td>${formatMetric(rows[1].summary[key])}</td>`);
}

function formatMetric(value) {
  return typeof value === 'number' && !Number.isInteger(value) ? fmt(value, 4) : value;
}

function update(data) {
  const candidateName = d3.select('#candidate-select').property('value');
  drawNodeLink(data, candidateName);
  drawRanking(data);
  drawGraphlets(data, candidateName);
  drawTemporal(data, candidateName);
  drawProfiles(data, candidateName);
  drawSeeds(data);
  drawDiagnostics(data, candidateName);
}

d3.json('/data/graphletmatchmaker.json').then((data) => {
  appShell(data);
  update(data);
  d3.select('#candidate-select').on('change', () => update(data));
  d3.select('#edge-filter').on('change', () => update(data));
});
