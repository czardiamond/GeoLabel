import React, { useState } from 'react';
import {
  Tag,
  Plus,
  Trash2,
  Download,
  Upload,
  X,
  Check,
  Code2,
  FileCode,
  Sliders,
  Layers,
  Sparkles
} from 'lucide-react';

export interface AttributeSchemaField {
  id: string;
  name: string;
  type: 'select' | 'text' | 'number' | 'boolean';
  options?: string[]; // for select dropdowns
  required?: boolean;
}

export interface CustomOntologyClass {
  id: string;
  label: string;
  name: string;
  color: string;
  toolType: 'polygon' | 'bbox' | 'point';
  attributeFields: AttributeSchemaField[];
}

interface OntologySchemaBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes?: CustomOntologyClass[];
  customClasses?: CustomOntologyClass[];
  onUpdateClasses?: (updatedClasses: CustomOntologyClass[]) => void;
  setCustomClasses?: (updatedClasses: CustomOntologyClass[]) => void;
  activeClass?: string;
  setActiveClass?: (cls: string) => void;
}

const DEFAULT_ONTOLOGY_CLASSES: CustomOntologyClass[] = [
  {
    id: 'building_footprint',
    label: 'building_footprint',
    name: 'Building Footprint',
    color: '#14b8a6',
    toolType: 'polygon',
    attributeFields: [
      {
        id: 'mat',
        name: 'Material',
        type: 'select',
        options: ['Concrete', 'Metal', 'Shingle'],
      },
    ],
  },
  {
    id: 'solar_pv_array',
    label: 'solar_pv_array',
    name: 'Solar PV Array',
    color: '#f59e0b',
    toolType: 'polygon',
    attributeFields: [
      {
        id: 'cond',
        name: 'Condition',
        type: 'select',
        options: ['Intact', 'Damaged', 'Soiled'],
      },
    ],
  },
];

export const OntologySchemaBuilderModal: React.FC<OntologySchemaBuilderModalProps> = ({
  isOpen,
  onClose,
  classes,
  customClasses,
  onUpdateClasses,
  setCustomClasses,
}) => {
  const effectiveClasses = customClasses || classes || DEFAULT_ONTOLOGY_CLASSES;
  const [classList, setClassList] = useState<CustomOntologyClass[]>(effectiveClasses);
  const [selectedClassId, setSelectedClassId] = useState<string>(effectiveClasses[0]?.id || 'building_footprint');

  const notifyUpdate = (updated: CustomOntologyClass[]) => {
    setClassList(updated);
    if (onUpdateClasses) onUpdateClasses(updated);
    if (setCustomClasses) setCustomClasses(updated);
  };

  // Form state for adding new class
  const [newClassName, setNewClassName] = useState<string>('');
  const [newClassColor, setNewClassColor] = useState<string>('#3b82f6');
  const [newClassTool, setNewClassTool] = useState<'polygon' | 'bbox' | 'point'>('polygon');

  // Form state for adding new attribute field to selected class
  const [newFieldName, setNewFieldName] = useState<string>('');
  const [newFieldType, setNewFieldType] = useState<'select' | 'text' | 'number' | 'boolean'>('select');
  const [newFieldOptions, setNewFieldOptions] = useState<string>('Option 1, Option 2, Option 3');

  if (!isOpen) return null;

  const currentClass = classList.find((c) => c.id === selectedClassId);

  const handleAddClass = () => {
    if (!newClassName.trim()) return;
    const id = newClassName.toLowerCase().replace(/\s+/g, '_');
    const newClassObj: CustomOntologyClass = {
      id,
      label: id,
      name: newClassName.trim(),
      color: newClassColor,
      toolType: newClassTool,
      attributeFields: [
        {
          id: `${id}_material`,
          name: 'Material Type',
          type: 'select',
          options: ['Standard', 'Reinforced', 'Composite'],
        },
        {
          id: `${id}_condition`,
          name: 'Structural Condition',
          type: 'select',
          options: ['Intact', 'Minor Wear', 'Severe Damage'],
        },
      ],
    };
    const updated = [...classList, newClassObj];
    notifyUpdate(updated);
    setSelectedClassId(id);
    setNewClassName('');
  };

  const handleDeleteClass = (id: string) => {
    if (classList.length <= 1) return;
    const updated = classList.filter((c) => c.id !== id);
    notifyUpdate(updated);
    if (selectedClassId === id) {
      setSelectedClassId(updated[0].id);
    }
  };

  const handleAddFieldToClass = () => {
    if (!currentClass || !newFieldName.trim()) return;
    const fieldId = `${currentClass.id}_${newFieldName.toLowerCase().replace(/\s+/g, '_')}`;
    const newField: AttributeSchemaField = {
      id: fieldId,
      name: newFieldName.trim(),
      type: newFieldType,
      options:
        newFieldType === 'select'
          ? newFieldOptions.split(',').map((o) => o.trim()).filter(Boolean)
          : undefined,
    };

    const updated = classList.map((c) => {
      if (c.id === currentClass.id) {
        return {
          ...c,
          attributeFields: [...c.attributeFields, newField],
        };
      }
      return c;
    });

    notifyUpdate(updated);
    setNewFieldName('');
  };

  const handleDeleteFieldFromClass = (fieldId: string) => {
    if (!currentClass) return;
    const updated = classList.map((c) => {
      if (c.id === currentClass.id) {
        return {
          ...c,
          attributeFields: c.attributeFields.filter((f) => f.id !== fieldId),
        };
      }
      return c;
    });

    notifyUpdate(updated);
  };

  const handleExportOntologyJson = () => {
    const jsonStr = JSON.stringify(classList, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geolabel_taxonomy_schema_${Date.now()}.json`;
    a.click();
  };

  const handleImportOntologyJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            notifyUpdate(parsed);
            if (parsed[0]) setSelectedClassId(parsed[0].id);
          }
        } catch (err) {
          alert('Invalid JSON taxonomy file format.');
        }
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Domain-Specific Class Ontology & Schema Builder
              </h2>
              <p className="text-xs text-slate-400">
                Design custom metadata schemas, attribute dropdowns, and taxonomy templates for satellite objects
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer border border-slate-700 transition flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-teal-400" />
              Import Schema
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportOntologyJson}
              />
            </label>
            <button
              onClick={handleExportOntologyJson}
              className="px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs font-semibold border border-teal-500/40 transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export Taxonomy JSON
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
          {/* Left Column: Classes List */}
          <div className="space-y-4 border-r border-slate-800 pr-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Ontology Classes ({classList.length})
              </h3>
            </div>

            {/* Class List Items */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {classList.map((cls) => (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  className={`p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                    selectedClassId === cls.id
                      ? 'border-teal-400 bg-teal-500/10 shadow-md'
                      : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20"
                      style={{ backgroundColor: cls.color }}
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-100">{cls.name}</div>
                      <div className="text-[10px] text-slate-400 uppercase font-mono">
                        {cls.toolType} • {cls.attributeFields.length} attributes
                      </div>
                    </div>
                  </div>
                  {classList.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClass(cls.id);
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add New Class Form */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-teal-400" /> Add New Object Class
              </h4>
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="Class Name (e.g., Damaged Roof)"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-slate-400">Color:</label>
                  <input
                    type="color"
                    value={newClassColor}
                    onChange={(e) => setNewClassColor(e.target.value)}
                    className="w-8 h-7 rounded bg-transparent cursor-pointer border border-slate-700"
                  />
                </div>
                <select
                  value={newClassTool}
                  onChange={(e) => setNewClassTool(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1"
                >
                  <option value="polygon">Polygon</option>
                  <option value="bbox">Bounding Box</option>
                  <option value="point">Point</option>
                </select>
              </div>
              <button
                onClick={handleAddClass}
                className="w-full py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
              >
                Add Class to Taxonomy
              </button>
            </div>
          </div>

          {/* Right 2 Columns: Attribute Schema Editor */}
          {currentClass ? (
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full border border-white/20"
                    style={{ backgroundColor: currentClass.color }}
                  />
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{currentClass.name} Attributes Schema</h3>
                    <p className="text-xs text-slate-400 font-mono">ID: {currentClass.id}</p>
                  </div>
                </div>
              </div>

              {/* Attributes List */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Configured Custom Metadata Fields ({currentClass.attributeFields.length})
                </h4>
                <div className="space-y-2">
                  {currentClass.attributeFields.map((field) => (
                    <div
                      key={field.id}
                      className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                          <span>{field.name}</span>
                          <span className="text-[10px] bg-slate-800 text-teal-300 px-2 py-0.5 rounded font-mono uppercase">
                            {field.type}
                          </span>
                        </div>
                        {field.options && (
                          <p className="text-[11px] text-slate-400 mt-1 font-mono">
                            Dropdown Options: {field.options.join(' | ')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteFieldFromClass(field.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Attribute Form */}
              <div className="bg-slate-950 p-4 rounded-xl border border-teal-500/30 space-y-3">
                <h4 className="text-xs font-bold text-teal-300 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-teal-400" /> Add Custom Attribute Field to {currentClass.name}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300">Attribute Name</label>
                    <input
                      type="text"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder="e.g. Solar Panel Brand or Roof Pitch Angle"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300">Field Input Type</label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                    >
                      <option value="select">Dropdown Select</option>
                      <option value="text">Text Input</option>
                      <option value="number">Numeric</option>
                      <option value="boolean">Yes/No Toggle</option>
                    </select>
                  </div>
                </div>

                {newFieldType === 'select' && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300">Dropdown Choices (comma-separated)</label>
                    <input
                      type="text"
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      placeholder="Gable, Flat, Hip, Sawtooth"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>
                )}

                <button
                  onClick={handleAddFieldToClass}
                  className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
                >
                  Append Attribute to {currentClass.name}
                </button>
              </div>
            </div>
          ) : (
            <div className="md:col-span-2 flex items-center justify-center text-slate-500 text-xs">
              Select or create a class to edit attributes
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
          >
            Save Taxonomy Settings
          </button>
        </div>
      </div>
    </div>
  );
};
