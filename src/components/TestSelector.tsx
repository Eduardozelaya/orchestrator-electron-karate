import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, X, FileText, Play } from 'lucide-react';

interface KarateTest {
  id: string;
  name: string;
  path: string;
  category: string;
  scenarios: string[];
  enabled: boolean;
}

interface TestSelectorProps {
  tests: KarateTest[];
  selectedTests: string[];
  onSelectionChange: (testIds: string[]) => void;
  isScanning: boolean;
}

const TestSelector: React.FC<TestSelectorProps> = ({
  tests,
  selectedTests,
  onSelectionChange,
  isScanning
}) => {
  const categories = [...new Set(tests.map(test => test.category))];

  const handleTestToggle = (testId: string) => {
    const newSelection = selectedTests.includes(testId)
      ? selectedTests.filter(id => id !== testId)
      : [...selectedTests, testId];
    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedTests.length === tests.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(tests.map(test => test.id));
    }
  };

  const handleCategoryToggle = (category: string) => {
    const categoryTests = tests.filter(test => test.category === category);
    const categoryTestIds = categoryTests.map(test => test.id);
    const allSelected = categoryTestIds.every(id => selectedTests.includes(id));

    if (allSelected) {
      onSelectionChange(selectedTests.filter(id => !categoryTestIds.includes(id)));
    } else {
      const newSelection = [...new Set([...selectedTests, ...categoryTestIds])];
      onSelectionChange(newSelection);
    }
  };

  if (isScanning) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-600">Escaneando arquivos .feature...</span>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-6 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex items-center justify-between pb-4 border-b">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          className="flex items-center gap-2"
        >
          {selectedTests.length === tests.length ? (
            <>
              <X className="h-4 w-4" />
              Desmarcar Todos
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Selecionar Todos
            </>
          )}
        </Button>
        <Badge variant="secondary" className="bg-slate-100">
          {selectedTests.length} de {tests.length} selecionados
        </Badge>
      </div>

      {/* Tests by Category */}
      {categories.map((category) => {
        const categoryTests = tests.filter(test => test.category === category);
        const selectedInCategory = categoryTests.filter(test => selectedTests.includes(test.id)).length;

        return (
          <div key={category} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedInCategory === categoryTests.length && categoryTests.length > 0}
                  onCheckedChange={() => handleCategoryToggle(category)}
                  className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                />
                <h3 className="font-semibold text-slate-800">{category}</h3>
                <Badge variant="outline" className="text-xs">
                  {selectedInCategory}/{categoryTests.length}
                </Badge>
              </div>
            </div>

            <div className="ml-6 space-y-2">
              {categoryTests.map((test) => (
                <div
                  key={test.id}
                  className={`p-3 rounded-lg border transition-all hover:shadow-sm ${
                    selectedTests.includes(test.id)
                      ? 'bg-green-50 border-green-200'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedTests.includes(test.id)}
                      onCheckedChange={() => handleTestToggle(test.id)}
                      className="mt-1 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-slate-500" />
                        <span className="font-medium text-slate-800">{test.name}</span>
                        {!test.enabled && (
                          <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
                            Desabilitado
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 font-mono truncate" title={test.path}>
                        {test.path}
                      </p>
                      {test.scenarios.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {test.scenarios.map((scenario, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {scenario}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {category !== categories[categories.length - 1] && (
              <Separator className="my-4" />
            )}
          </div>
        );
      })}

      {tests.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum teste encontrado</p>
          <p className="text-sm">Verifique se o caminho do projeto está correto</p>
        </div>
      )}
    </div>
  );
};

export default TestSelector;
