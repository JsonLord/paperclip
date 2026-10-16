import pathlib,json,hashlib,re,sys,subprocess,argparse
parser=argparse.ArgumentParser(description="Generate reviewed Agency workforce definitions from the pinned upstream checkout.")
parser.add_argument("source",type=pathlib.Path)
args=parser.parse_args()
r=args.source.resolve()
expected="cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09"
if subprocess.check_output(["git","-C",str(r),"rev-parse","HEAD"],text=True).strip()!=expected: raise SystemExit("Upstream commit differs; review semantic mappings and provenance before updating the pin")
if subprocess.check_output(["git","-C",str(r),"status","--porcelain"],text=True).strip(): raise SystemExit("Upstream checkout is dirty; pinned provenance requires a clean source")
sys.path.insert(0,str(r))
from validation_workforce.catalog import build,validate
d=build(r);validate(d)
# Reviewed semantic mappings supplement broad source tool capabilities, never vendor credentials.
rows='''problem-explorer|discovery.problem|problem_existence,problem_context,customer_segment|EXPLORE,CONCENTRATE|collection,analysis,interview_preparation
community-scout|community.collection|community_observation,customer_language|EXPLORE,CONCENTRATE,REFINE|collection,interview_preparation
customer-investigator|customer.evidence_analysis|dataset_analysis,problem_existence,customer_language,evidence_quality|EXPLORE,CONCENTRATE,REFINE|analysis
ethnographic-researcher|discovery.ethnography|problem_context,alternative_behavior,current_solution|EXPLORE,CONCENTRATE|collection,interview_preparation
trend-scout|discovery.trends|trend_context|EXPLORE|collection
assumption-mapper|hypothesis.assumptions|assumption_mapping|EXPLORE,CONCENTRATE|analysis
hypothesis-formulator|hypothesis.formulate|testable_hypothesis|EXPLORE,CONCENTRATE|analysis
causal-analyst|hypothesis.causal|causal_mechanism|CONCENTRATE,REFINE|analysis
counter-hypothesis-generator|hypothesis.counter|counter_hypothesis|EXPLORE,CONCENTRATE,REFINE|analysis
opportunity-synthesizer|hypothesis.opportunity|opportunity_synthesis|EXPLORE,CONCENTRATE|analysis
customer-language-analyst|customer.language_analysis|customer_language,customer_language_refinement|CONCENTRATE,REFINE|analysis
value-position-designer|proposition.value|value_proposition|CONCENTRATE,REFINE|design,analysis
positioning-strategist|proposition.positioning|positioning|CONCENTRATE,REFINE|design,analysis
offer-designer|proposition.offer|offer|CONCENTRATE,REFINE|design,analysis
pricing-strategist|proposition.pricing|pricing_hypothesis|CONCENTRATE,REFINE|design,analysis
experiment-designer|experiment.design|experiment_design,concierge_test|CONCENTRATE,REFINE|design,analysis
message-test-designer|experiment.message|message_test|CONCENTRATE,REFINE|design,frontend,analysis
pricing-test-designer|experiment.pricing|pricing_test|CONCENTRATE,REFINE|design,frontend,analysis
fake-door-designer|experiment.fake_door|fake_door|CONCENTRATE,REFINE|design,frontend,analysis
pretotype-designer|experiment.pretotype|pretotype|CONCENTRATE,REFINE|design,frontend,analysis
channel-researcher|distribution.channel|channel_viability|EXPLORE,CONCENTRATE,REFINE|collection,analysis
community-activation-specialist|distribution.community|community_activation|REFINE|design,collection,analysis
content-experimenter|distribution.content|content_response|REFINE|design,frontend,analysis
demand-generation-tester|distribution.demand|demand_generation|REFINE|design,analysis
outbound-experimenter|distribution.outbound|outbound_response|REFINE|design,analysis
market-intelligence-analyst|intelligence.market|customer_segment,current_solution|EXPLORE,CONCENTRATE|analysis
competitive-intelligence-analyst|intelligence.competition|current_solution,alternative_behavior|EXPLORE,CONCENTRATE|analysis
review-miner|intelligence.reviews|community_observation,alternative_behavior|EXPLORE,CONCENTRATE|collection
signal-analyst|intelligence.signals|trend_context|EXPLORE,CONCENTRATE|analysis
lead-researcher|commercial.cohort_spec|outbound_response|REFINE|design
wtp-skeptic|evaluation.wtp|wtp_challenge|CONCENTRATE,REFINE,FOUNDER_HANDOFF|evaluation
demand-skeptic|evaluation.demand|demand_challenge|CONCENTRATE,REFINE,FOUNDER_HANDOFF|evaluation
distribution-skeptic|evaluation.distribution|distribution_challenge|REFINE,FOUNDER_HANDOFF|evaluation
evidence-auditor|evaluation.evidence|evidence_quality|EXPLORE,CONCENTRATE,REFINE,FOUNDER_HANDOFF|evaluation
red-team-analyst|evaluation.red_team|red_team_review|CONCENTRATE,REFINE,FOUNDER_HANDOFF|evaluation
venture-judge|decision.venture|go_pivot_stop|REFINE,FOUNDER_HANDOFF|decision
pivot-strategist|decision.pivot|pivot_design|CONCENTRATE,REFINE,FOUNDER_HANDOFF|decision
kill-agent|decision.kill|kill_review|CONCENTRATE,REFINE,FOUNDER_HANDOFF|decision
portfolio-allocator|decision.portfolio|portfolio_allocation|CONCENTRATE,REFINE,FOUNDER_HANDOFF|decision
founder-intelligence-reporter|decision.founder_intelligence|founder_intelligence|EXPLORE,CONCENTRATE,REFINE,FOUNDER_HANDOFF|analysis
prototype-director|production.prototype|pretotype|REFINE|design,frontend
landing-page-builder|production.landing|fake_door,campaign_asset|REFINE|frontend
visual-creative|production.visual|visual,campaign_asset|REFINE|design,frontend
demo-producer|production.demo|demo,campaign_asset|REFINE|design,frontend
copy-producer|production.copy|campaign_asset,message_test|REFINE|design,frontend'''
config={x.split('|')[0]:x.split('|')[1:] for x in rows.splitlines()};assert len(config)==len(d['agents'])
def sha(text):return hashlib.sha256(text.encode()).hexdigest()
def sections(text):
 text=text.split('---',2)[-1];parts=re.split(r'^## ',text,flags=re.M);out={}
 for part in parts[1:]:
  name,_,body=part.partition('\n');out[name.strip()]=[l.strip().removeprefix('- ') for l in body.splitlines() if l.strip() and not l.startswith('#')]
 return out
def normalize(lines):
 out=[]
 for line in lines:
  if re.search(r'\b[3-9]\+|at least [3-9]|control.*treatment|treatment.*control',line,re.I):continue
  out.append(line[:2000])
 return out[:25]
agents=[];caps=[]
for a in d['agents']:
 cap,gaps,phases,stages=config[a['id']];caps.append({'id':cap,'gaps':gaps.split(','),'agentIds':[a['id']]})
 text=(r/a['source']).read_text();s=sections(text);collection='collection' in stages.split(',');independent=a['division'] in ['evaluation','decision'] or a['id']=='counter-hypothesis-generator'
 aliases=sorted(set(a['aliases']+[f"{a['division']}/{a['id']}"]+(['value-proposition-designer'] if a['id']=='value-position-designer' else [])))
 notes=['Quantity-oriented success criteria replaced with decision relevance and minimum-sufficient output.']
 if not collection: notes.append('Broad source browsing defaults removed; missing data becomes a structured research gap.')
 if a['division']=='production':notes.append('Validation-facing artifacts only. No production product/backend engineering.')
 rules=normalize(s.get('Critical Rules',[]))+normalize(s.get('Boundaries',[]))
 rules += ['Never assign canonical Nodepad qualification, confidence or bands.','No product/backend engineering, deployment, outreach or lead discovery without the separate applicable founder authority.']
 if a['id']=='lead-researcher':rules=['Define the smallest useful prospect cohort only after commercial readiness, including hypothesis, target segment, missing evidence, desired conversations, stop condition, information gain, and maximum scope/cost.','Prepare a provider request for founder approval; do not discover prospects or contact customers.']
 if a['id']=='founder-intelligence-reporter':rules += ['Activity is not progress. Output is not evidence. Evidence is not validation. Validation is not traction.','Consume deterministic host metrics; never invent numeric values or rewrite independent specialist findings.']
 mission=' '.join(normalize(s.get('Mission',s.get('Core Mission',[]))))[:4000] or a['description']
 agents.append({'agencyId':a['id'],'name':a['name'],'division':a['division'],'aliases':aliases,'sourcePath':a['source'],'contentHash':sha(text),'description':a['description'],'skills':a['skills'],'sourceCapabilities':a['capabilities'],'capabilities':[cap], 'nodepad':{'reads':a['reads'],'writes':(['research_gap'] if a['id']=='community-scout' else a['writes'])},'activation':{'phases':phases.split(','),'stages':stages.split(','),'defaultState':'AVAILABLE' if a['id']=='founder-intelligence-reporter' else 'DORMANT','scheduleSec':86400 if a['id']=='founder-intelligence-reporter' else 0,'collection':collection,'independent':independent,'productionOnly':a['division']=='production'},'runtimeHints':a.get('runtime') or {},'approval':{'externalWrite':'required','leadDiscovery':'separate_founder_approval','contact':'separate_founder_approval'},'methodology':{'mission':mission,'rules':rules[:100],'successCriteria':['Produce the minimum distinct falsifiable output needed to resolve the named uncertainty.','Preserve provenance, contradictory observations, denominators where applicable, and limitations.','Optimize decision relevance, information gain, blocker resolution and convergence, not output quantity.','Select the smallest credible experiment capable of changing the decision; use controlled groups only when attribution warrants them.'],'handoffs':normalize(s.get('Handoff Rules',[])),'normalizationNotes':notes}})
skills=[]
for skill in d['skills']:
 text=(r/skill['source']).read_text();sec=sections(text)
 methods=normalize([v for values in sec.values() for v in values])
 skills.append({'id':skill['id'],'version':skill.get('version','1'),'source':skill['source'],'contentHash':sha(text),'methodology':methods or [skill['description']]})
workflows=[]
for w in d['workflows']:
 text=(r/'workflows'/f"{w['id']}.json").read_text()
 workflows.append({'id':w['id'],'version':w['version'],'objective':w['objective'],'inputs':w['inputs'],'sourcePath':f"workflows/{w['id']}.json",'contentHash':sha(text),'steps':[{'id':step['id'],'agencyId':step['agent_id'],'skills':step['skill_ids'],'capabilities':step.get('capabilities',[]),'dependsOn':step['depends_on'],'expectedOutputs':step['expected_outputs']} for step in w['steps']]})
bundle={'version':'agency-workforce/v1','importerVersion':'paperclip-agency/v1','source':{'repository':'JsonLord/agency-agents','branch':'validation-workforce','commit':'cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09','license':(r/'LICENSE').read_text()},'sourceAliases':json.loads((r/'catalog/legacy-aliases.json').read_text()),'divisions':sorted(d['divisions']),'skills':skills,'providerCapabilities':[{k:c[k] for k in ['id','scope','approval']} for c in d['capabilities']],'capabilities':caps,'agents':agents,'workflows':workflows}
(pathlib.Path(__file__).resolve().parents[1]/'server/src/services/workforce/catalog/agency-validation-workforce.json').write_text(json.dumps(bundle,indent=2)+'\n')
print('Built reviewed JSON definitions:',len(agents),len(workflows),len(skills))
