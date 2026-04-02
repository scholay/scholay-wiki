/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * All Rights Reserved.
 * ============================================================================
 *
 * Demo data for the peer review feature page.
 * Structures align with parseReviewJSON / exportUtils expectations.
 */

export const DEMO_PAPER = {
  title: 'Deep Learning-Based Automated Detection of Pulmonary Nodules in Low-Dose CT Scans: A Multi-Center Validation Study',
  authors: 'Zhang, Y., Liu, M., Chen, H., Wang, X., & Li, J.',
  journal: 'Medical Image Analysis (Under Review)',
  abstract:
    'Early detection of pulmonary nodules is critical for improving lung cancer survival rates. ' +
    'We propose PulmoNet, a 3D convolutional neural network that combines a Feature Pyramid Network backbone with an attention-gated detection head for automated pulmonary nodule detection in low-dose computed tomography (LDCT) scans. ' +
    'The model was trained on 2,847 LDCT cases from three medical centers and evaluated on an independent test set of 1,024 cases. ' +
    'PulmoNet achieved a sensitivity of 94.3% at 1.0 false positive per scan and an AUROC of 0.962, outperforming existing methods including Lung-RADS assisted detection. ' +
    'We further demonstrate that the attention mechanism provides interpretable activation maps that correlate with radiologist-identified regions of interest. ' +
    'Our results suggest PulmoNet can serve as a reliable clinical decision-support tool for lung cancer screening programs.',
  keywords: ['pulmonary nodule detection', 'deep learning', 'low-dose CT', 'computer-aided diagnosis', 'lung cancer screening'],
  field: 'Medical Imaging / Deep Learning',
};

export const DEMO_SCORES = {
  originality: 72,
  methodology: 85,
  clarity: 68,
  significance: 76,
  reproducibility: 80,
};

const FINAL_REPORT = {
  overall_assessment: {
    summary:
      'This manuscript presents PulmoNet, a 3D CNN architecture for automated pulmonary nodule detection in LDCT scans. ' +
      'The multi-center validation design and the achieved sensitivity (94.3% at 1 FP/scan) represent meaningful clinical progress. ' +
      'The attention-based interpretability component is a notable addition. However, several methodological concerns require attention: ' +
      'the lack of comparison with recent transformer-based architectures, insufficient statistical analysis of cross-center performance variance, ' +
      'and unclear reporting of the data preprocessing pipeline. ' +
      'With targeted revisions addressing these issues, the work has strong potential for acceptance.',
    recommendation: 'Minor Revision',
    confidence: 'High',
  },
  critical_issues: [
    {
      issue_title: 'Incomplete Comparison with State-of-the-Art Methods',
      issue_description:
        'The comparative analysis omits several recent transformer-based detection models (e.g., DETR-Lung, NoduleTR) published in 2024. ' +
        'Given that these methods report competitive or superior results on public benchmarks, the claimed "outperforming existing methods" lacks sufficient evidence.',
      severity: 'Critical',
      affected_sections: ['Section 4.2 - Comparative Experiments', 'Section 5 - Discussion'],
      required_actions:
        'Include comparisons with at least two recent transformer-based methods using the same evaluation protocol. ' +
        'Revise claims of superiority to accurately reflect the comparative landscape.',
    },
    {
      issue_title: 'Cross-Center Performance Variance Not Statistically Characterized',
      issue_description:
        'Table 3 shows notable sensitivity differences across the three medical centers (91.2% – 96.8%), ' +
        'yet no statistical tests (e.g., DeLong test for AUROC comparison) or confidence intervals are reported. ' +
        'This omission undermines the reliability claims of the multi-center validation.',
      severity: 'Major',
      affected_sections: ['Section 4.3 - Multi-Center Analysis', 'Table 3'],
      required_actions:
        'Report 95% confidence intervals for all performance metrics per center. ' +
        'Conduct DeLong tests to assess whether cross-center differences are statistically significant.',
    },
    {
      issue_title: 'Data Preprocessing Pipeline Lacks Reproducible Detail',
      issue_description:
        'Section 3.1 mentions "standard preprocessing" but does not specify windowing parameters, resampling resolution, or normalization range. ' +
        'Different preprocessing choices are known to significantly affect nodule detection performance.',
      severity: 'Major',
      affected_sections: ['Section 3.1 - Data Preprocessing'],
      required_actions:
        'Provide complete preprocessing specifications including HU windowing range, target voxel spacing, and intensity normalization method.',
    },
  ],
  other_suggestions: [
    {
      suggestion_title: 'Clarify Attention Map Evaluation Methodology',
      suggestion_description:
        'The claim that attention maps "correlate with radiologist-identified regions" is supported only by visual examples. ' +
        'Consider adding a quantitative overlap metric such as Dice coefficient between attention heatmaps and manual annotations.',
      suggestion_location: 'Section 4.4 - Interpretability Analysis',
      suggestion_rationale: 'Quantitative evaluation would strengthen the interpretability claims significantly.',
    },
    {
      suggestion_title: 'Discuss Computational Cost and Clinical Feasibility',
      suggestion_description:
        'Inference time, GPU memory requirements, and model size are not reported. ' +
        'For clinical deployment in screening programs, these practical considerations are essential.',
      suggestion_location: 'Section 5 - Discussion',
      suggestion_rationale: 'Clinical adoption depends heavily on computational efficiency and hardware requirements.',
    },
    {
      suggestion_title: 'Minor Formatting and Language Issues',
      suggestion_description:
        'Several figures have low-resolution labels. Table 2 caption is incomplete. ' +
        'A few grammatical errors remain in Sections 2 and 5.',
      suggestion_location: 'Throughout manuscript',
      suggestion_rationale: 'These minor issues should be corrected before final submission.',
    },
  ],
  extended_review_items: {
    novelty_evaluation:
      'The combination of Feature Pyramid Network with attention-gated detection heads for 3D pulmonary nodule detection is an incremental but meaningful contribution. ' +
      'While individual components (FPN, attention mechanisms) are well-established, their specific integration for LDCT screening has not been previously reported. ' +
      'The interpretability through attention maps adds practical clinical value. Score: 72/100.',
    technical_soundness:
      'The experimental design is generally rigorous with multi-center validation and proper train/test splitting. ' +
      'However, the absence of statistical significance testing weakens the quantitative claims. ' +
      'The ablation study effectively demonstrates the contribution of each architectural component. ' +
      'The FROC analysis is appropriately conducted. Score: 85/100.',
    clarity_and_presentation:
      'The manuscript is largely well-organized but could benefit from improved clarity in several areas. ' +
      'The preprocessing pipeline description is insufficient for reproduction. ' +
      'Figure quality needs improvement — several figures have illegible axis labels when printed. ' +
      'The related work section adequately covers the field but misses recent transformer-based approaches. Score: 68/100.',
    reproducibility: {
      data_availability:
        'The training data from three medical centers is described but not publicly available due to privacy regulations. ' +
        'The authors should clarify whether a de-identified subset could be released or whether the model can be evaluated on public datasets (e.g., LUNA16).',
      code_availability:
        'The authors state that code will be released upon acceptance. A GitHub repository URL is provided but currently private. ' +
        'Releasing the trained model weights would further enhance reproducibility. Score: 80/100.',
    },
    ethical_considerations:
      'The study received IRB approval from all three participating centers. Patient consent procedures are adequately described. ' +
      'The discussion of potential bias from demographic imbalance across centers is minimal and should be expanded.',
    impact_and_significance:
      'If the methodological concerns are addressed, this work has meaningful potential impact for clinical lung cancer screening programs. ' +
      'The attention-based interpretability component is particularly relevant for clinical adoption, where explainability is increasingly required. ' +
      'The multi-center validation adds credibility for real-world deployment. Score: 76/100.',
    recommend_for_improvement:
      'Focus revisions on: (1) adding transformer-based comparisons, (2) providing statistical analysis of cross-center variance, ' +
      '(3) detailing the preprocessing pipeline, and (4) quantifying attention map quality. These changes would substantially strengthen the manuscript.',
  },
};

const REVIEWER_ALPHA = {
  overall_assessment: {
    summary:
      'Reviewer Alpha focuses on the methodological rigor and experimental validation of PulmoNet. ' +
      'The multi-center study design is commendable, and the FROC analysis is well-conducted. ' +
      'However, the statistical analysis lacks depth — cross-center performance differences are not formally tested, ' +
      'and the comparison baseline is outdated. The ablation study is a strength.',
    recommendation: 'Minor Revision',
    confidence: 'High',
  },
  critical_issues: [
    {
      issue_title: 'Missing Statistical Significance Tests',
      issue_description:
        'No confidence intervals or p-values are reported for the main performance metrics. ' +
        'The DeLong test should be used for AUROC comparisons.',
      severity: 'Major',
      affected_sections: ['Section 4 - Results'],
      required_actions: 'Add 95% CI and appropriate significance tests to all main results tables.',
    },
    {
      issue_title: 'Outdated Baseline Models',
      issue_description:
        'The most recent comparison method is from 2022. Several competitive approaches from 2023-2024 are not included.',
      severity: 'Critical',
      affected_sections: ['Section 4.2 - Comparative Experiments'],
      required_actions: 'Include NoduleTR (2024) and DETR-Lung (2023) in the comparison.',
    },
  ],
  other_suggestions: [
    {
      suggestion_title: 'Report Per-Nodule-Size Performance',
      suggestion_description:
        'Sensitivity breakdown by nodule diameter (< 6mm, 6-10mm, > 10mm) would provide clinically relevant insights.',
    },
  ],
  extended_review_items: {
    novelty_evaluation: 'Incremental novelty — the FPN + attention combination is well-motivated but not groundbreaking. Score: 70/100.',
    technical_soundness: 'Solid experimental framework with multi-center data. Missing statistical rigor is the main concern. Score: 82/100.',
    clarity_and_presentation: 'Generally clear writing. Methods section needs more detail. Score: 72/100.',
    reproducibility: 'Code release promised. Preprocessing details insufficient. Score: 75/100.',
    ethical_considerations: 'IRB approval documented. Bias discussion could be expanded.',
    impact_and_significance: 'Clinically relevant work with practical deployment potential. Score: 78/100.',
  },
};

const REVIEWER_BETA = {
  overall_assessment: {
    summary:
      'Reviewer Beta evaluates the technical architecture and the novelty of PulmoNet. ' +
      'The attention-gated detection head is an interesting design choice, and the interpretability analysis is a valuable addition. ' +
      'The main weakness is the lack of quantitative evaluation of the attention maps and insufficient comparison with recent methods. ' +
      'The writing quality is adequate but the figure quality needs improvement.',
    recommendation: 'Minor Revision',
    confidence: 'Medium',
  },
  critical_issues: [
    {
      issue_title: 'Attention Map Evaluation Is Only Qualitative',
      issue_description:
        'Claiming that attention maps "correlate" with radiologist annotations requires quantitative evidence (Dice, IoU, etc.), not just visual cherry-picked examples.',
      severity: 'Major',
      affected_sections: ['Section 4.4 - Interpretability'],
      required_actions: 'Add Dice coefficient or IoU between attention heatmaps and expert annotations for at least 100 cases.',
    },
  ],
  other_suggestions: [
    {
      suggestion_title: 'Improve Figure Resolution',
      suggestion_description: 'Figures 3 and 5 have illegible axis labels when printed at standard journal resolution.',
    },
    {
      suggestion_title: 'Add Failure Case Analysis',
      suggestion_description: 'A discussion of typical false negative patterns would strengthen the clinical relevance of the work.',
    },
  ],
  extended_review_items: {
    novelty_evaluation: 'The attention-gated head for 3D nodule detection is a reasonable contribution. Score: 74/100.',
    technical_soundness: 'Architecture is well-designed. The ablation study is thorough. Score: 86/100.',
    clarity_and_presentation: 'Writing is acceptable. Figures need quality improvement. Related work gaps exist. Score: 65/100.',
    reproducibility: 'Preprocessing description is a critical gap for reproduction. Score: 78/100.',
    ethical_considerations: 'Adequate ethical documentation.',
    impact_and_significance: 'Good potential for clinical screening applications. Score: 75/100.',
  },
};

const REVIEWER_GAMMA = {
  overall_assessment: {
    summary:
      'Reviewer Gamma assesses the overall contribution and clinical significance of PulmoNet. ' +
      'The multi-center validation with 3,871 total cases provides a solid evidence base. ' +
      'The 94.3% sensitivity at 1 FP/scan is clinically meaningful for screening workflows. ' +
      'Key concerns include the missing computational cost analysis and the incomplete preprocessing description. ' +
      'Overall, this is a solid contribution that merits publication with minor revisions.',
    recommendation: 'Accept with Minor Revision',
    confidence: 'High',
  },
  critical_issues: [
    {
      issue_title: 'No Computational Cost Reporting',
      issue_description:
        'For a system targeting clinical screening deployment, the absence of inference time, GPU memory, and model parameter count is a significant omission.',
      severity: 'Major',
      affected_sections: ['Section 3 - Methods', 'Section 5 - Discussion'],
      required_actions: 'Report inference time per scan, GPU memory usage, model parameter count, and discuss clinical deployment feasibility.',
    },
  ],
  other_suggestions: [
    {
      suggestion_title: 'Discuss Demographic Bias',
      suggestion_description: 'The three centers likely serve different demographics. A brief analysis of performance across age groups and gender would be valuable.',
    },
    {
      suggestion_title: 'Complete Table 2 Caption',
      suggestion_description: 'Table 2 caption appears truncated and should include a full description of the abbreviations used.',
    },
  ],
  extended_review_items: {
    novelty_evaluation: 'Multi-center validation at this scale is uncommon in the literature and adds significant value. Score: 73/100.',
    technical_soundness: 'Experimental methodology is mostly sound. Statistical gaps should be addressed. Score: 84/100.',
    clarity_and_presentation: 'Well-structured manuscript. Some sections could be more concise. Score: 70/100.',
    reproducibility: 'Data privacy limitations are understandable. Public benchmark evaluation would help. Score: 82/100.',
    ethical_considerations: 'Thorough ethical documentation. Bias discussion should be expanded.',
    impact_and_significance: 'Strong clinical relevance for screening programs. Score: 78/100.',
  },
};

export const DEMO_TASK = {
  id: 'demo-task-001',
  status: 'completed',
  progress: 100,
  progress_stage: '审稿完成',
  input_type: 'file',
  manuscript_text: DEMO_PAPER.abstract,
  manuscript_file: { file_name: 'PulmoNet_manuscript_v2.pdf' },
  final_recommendation: 'Minor Revision',
  recommendation: 'Minor Revision',
  consensus_score: 0.78,
  submitted_at: '2025-03-28T09:15:00Z',
  created_at: '2025-03-28T09:15:00Z',
  completed_at: '2025-03-28T09:18:42Z',
  manuscript_meta: {
    title: DEMO_PAPER.title,
    field: DEMO_PAPER.field,
    main_topic: 'Automated pulmonary nodule detection using deep learning',
    keywords: DEMO_PAPER.keywords,
    claimed_novelty: [
      'FPN + attention-gated detection head for 3D LDCT',
      'Multi-center validation across 3 institutions',
      'Interpretable attention maps for clinical trust',
    ],
  },
  final_review_content: JSON.stringify(FINAL_REPORT),
  reviews: [
    { reviewer_index: 1, status: 'completed', recommendation: 'Minor Revision', review_content: JSON.stringify(REVIEWER_ALPHA) },
    { reviewer_index: 2, status: 'completed', recommendation: 'Minor Revision', review_content: JSON.stringify(REVIEWER_BETA) },
    { reviewer_index: 3, status: 'completed', recommendation: 'Accept with Minor Revision', review_content: JSON.stringify(REVIEWER_GAMMA) },
  ],
};

export const DEMO_PARSED_REPORT = FINAL_REPORT;

export const DEMO_REVIEWER_REPORTS = {
  Alpha: REVIEWER_ALPHA,
  Beta: REVIEWER_BETA,
  Gamma: REVIEWER_GAMMA,
};

export const ANIMATION_LINES = [
  { type: 'section', text: 'Overall Assessment' },
  { type: 'text', text: FINAL_REPORT.overall_assessment.summary },
  { type: 'section', text: 'Critical Issues' },
  ...FINAL_REPORT.critical_issues.map((issue, i) => ({
    type: 'issue',
    severity: issue.severity,
    text: `${i + 1}. ${issue.issue_title}`,
    detail: issue.issue_description,
  })),
  { type: 'section', text: 'Suggestions' },
  ...FINAL_REPORT.other_suggestions.slice(0, 2).map((s, i) => ({
    type: 'suggestion',
    text: `${i + 1}. ${s.suggestion_title}`,
  })),
  { type: 'verdict', text: 'Minor Revision', consensus: '78%' },
];
