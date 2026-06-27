"use client";

import { useRef, useState } from "react";
import {
  deleteProject,
  importProjectJson,
  listProjects,
  type StoredProject,
} from "@/lib/project-storage";

interface ProjectsMenuProps {
  currentId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: (project: StoredProject) => void;
}

export function ProjectsMenu({
  currentId,
  onSelect,
  onNew,
  onImport,
}: ProjectsMenuProps) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const projects = listProjects();
  const current = projects.find((p) => p.id === currentId);

  const handleImport = async (file: File) => {
    const text = await file.text();
    const project = importProjectJson(text);
    onImport(project);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="max-w-[180px] truncate rounded-lg border border-zinc-700 px-3 py-1.5 text-left text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
        title={current?.title ?? "Projects"}
      >
        {current?.title ?? "Projects"} ▾
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                onNew();
                setOpen(false);
              }}
              className="flex w-full px-3 py-2 text-left text-xs text-indigo-400 hover:bg-zinc-800"
            >
              + New lesson
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full px-3 py-2 text-left text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Import project JSON…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
            {projects.length > 0 && (
              <div className="my-1 border-t border-zinc-800" />
            )}
            {projects.map((project) => (
              <div
                key={project.id}
                className={`group flex items-center gap-1 px-1 ${
                  project.id === currentId ? "bg-zinc-800/60" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(project.id);
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 truncate px-2 py-2 text-left text-xs text-zinc-300 hover:text-zinc-100"
                >
                  <span className="block truncate">{project.title}</span>
                  <span className="text-[10px] text-zinc-600">
                    {new Date(project.updatedAt).toLocaleDateString()} ·{" "}
                    {Object.keys(project.files).length} files
                  </span>
                </button>
                {project.id !== currentId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject(project.id);
                      setOpen(false);
                    }}
                    className="shrink-0 px-2 py-1 text-[10px] text-zinc-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
                    title="Delete project"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
