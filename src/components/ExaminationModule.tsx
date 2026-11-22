import { useState } from 'react';
import { ClipboardList, PencilRuler, SquarePen } from 'lucide-react';
import type { Student } from '@/lib/schoolTypes';
import { ExamsSetupTab } from '@/components/ExamsSetupTab';
import { MarksEntryTab } from '@/components/MarksEntryTab';
import { ResultsTab } from '@/components/ResultsTab';

type ExamTab = 'setup' | 'marks' | 'results';

const TABS: { id: ExamTab; label: string; hint: string; icon: typeof ClipboardList }[] = [
  { id: 'setup', label: 'Exams Setup', hint: 'Exams and their subjects', icon: PencilRuler },
  { id: 'marks', label: 'Marks Entry', hint: 'Enter marks class by class', icon: SquarePen },
  { id: 'results', label: 'Results / Report Cards', hint: 'Positions, grades and printing', icon: ClipboardList },
];

export function ExaminationModule({ students, onToast }: { students: Student[]; onToast: (message: string) => void }) {
  const [tab, setTab] = useState<ExamTab>('setup');

  return (
    <div className="admin-panel examination-module">
      <div className="admin-header">
        <div>
          <span className="eyebrow">Examination</span>
          <h2>Examinations</h2>
          <p>Set up each examination and its subjects, enter the marks, then review results and print report cards.</p>
        </div>
      </div>

      <div className="att-tabs" role="tablist">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`att-tab ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <Icon size={15} />
              <span className="att-tab-label">
                {item.label}
                <small>{item.hint}</small>
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'setup' ? (
        <ExamsSetupTab onToast={onToast} />
      ) : tab === 'marks' ? (
        <MarksEntryTab students={students} onToast={onToast} />
      ) : (
        <ResultsTab students={students} />
      )}
    </div>
  );
}
