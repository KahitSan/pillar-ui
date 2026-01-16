import { createSignal, createMemo, createEffect, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import axios from 'axios';
import Search from 'lucide-solid/icons/search';
import ChevronLeft from 'lucide-solid/icons/chevron-left';
import ChevronRight from 'lucide-solid/icons/chevron-right';
import ChevronDown from 'lucide-solid/icons/chevron-down';
import ChevronUp from 'lucide-solid/icons/chevron-up';

// A more specific type for the row data, using a generic
interface DataTableRow {
  [key: string]: any;
}

// Refined column definition with generic type
export interface DataTableColumn<T extends DataTableRow> {
  data: keyof T & string | null;
  title?: string;
  render?: (data: T[keyof T] | null, type: 'display', row: T, meta: { row: number; col: number }) => JSX.Element | string;
  orderable?: boolean;
  className?: string;
}

// Refined column definition for overrides
interface DataTableColumnDef<T extends DataTableRow> {
  targets: number | number[] | '_all';
  render?: (data: T[keyof T] | null, type: 'display', row: T, meta: { row: number; col: number }) => JSX.Element | string;
  orderable?: boolean;
  className?: string;
  visible?: boolean;
}

// Header button interface with proper icon type
interface DataTableHeaderButton {
  text: string;
  icon?: any;
  onClick?: () => void;
  className?: string;
}

// AJAX configuration interface
interface DataTableAjax<T extends DataTableRow> {
  url?: string;
  dataSrc?: string | ((json: any) => T[]);
}

// Main component props with generic type
interface DataTableProps<T extends DataTableRow> {
  ajax?: string | DataTableAjax<T>;
  columns?: DataTableColumn<T>[];
  columnDefs?: DataTableColumnDef<T>[];
  data?: T[];

  searching?: boolean;
  ordering?: boolean;
  paging?: boolean;
  info?: boolean;

  serverSide?: boolean;

  pageLength?: number;
  lengthMenu?: [number[], (number | string)[]];

  headerButtons?: DataTableHeaderButton[];
  headers?: Record<string, string>; // Custom headers for AJAX requests
  class?: string;
  debounceDelay?: number; // Debounce delay in milliseconds (default: 300ms)
}

// DataTable.net standard server-side parameters interface
interface ServerSideParams {
  draw: number;
  start: number;
  length: number;
  'search[value]': string;
  'search[regex]': boolean;
  'order[0][column]'?: number;
  'order[0][dir]'?: string;
  [key: string]: any;
}

export default function DataTable<T extends DataTableRow>(props: DataTableProps<T>) {
  // Default values with type safety
  const ajax = () => props.ajax || null;
  const columns = () => props.columns || [];
  const columnDefs = () => props.columnDefs || [];
  const data = () => props.data || [];
  const searching = () => props.searching ?? true;
  const ordering = () => props.ordering ?? true;
  const paging = () => props.paging ?? true;
  const info = () => props.info ?? true;
  const serverSide = () => props.serverSide ?? false;
  const pageLength = () => props.pageLength ?? 10;
  const lengthMenu = () => props.lengthMenu ?? [[10, 25, 50, 100], [10, 25, 50, 100]];
  const headerButtons = () => props.headerButtons || [];
  const className = () => props.class || '';
  const debounceDelay = () => props.debounceDelay ?? 300;
  const customHeaders = () => props.headers || {};

  // State with explicit types
  const [searchTerm, setSearchTerm] = createSignal('');
  const [currentPage, setCurrentPage] = createSignal(1);
  const [itemsPerPage, setItemsPerPage] = createSignal(pageLength());
  const [sortConfig, setSortConfig] = createSignal<{ key: keyof T & string | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc'
  });
  const [tableData, setTableData] = createSignal<T[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [drawCounter, setDrawCounter] = createSignal(1);
  const [hasUserInteracted, setHasUserInteracted] = createSignal(false);
  const [isDebouncing, setIsDebouncing] = createSignal(false);

  const [recordsTotal, setRecordsTotal] = createSignal(0);
  const [recordsFiltered, setRecordsFiltered] = createSignal(0);

  const effectiveColumns = createMemo(() => {
    if (columns().length > 0) return columns();

    const dataArray = tableData();
    if (dataArray.length === 0) return [];

    const firstRow = dataArray[0];
    return Object.keys(firstRow).map(key => ({ data: key as keyof T & string }));
  });

  const finalColumns = createMemo(() => {
    let result: DataTableColumn<T>[] = [...effectiveColumns()];

    columnDefs().forEach(def => {
      const { targets, ...defOptions } = def;
      let columnIndexes: number[] = [];

      if (Array.isArray(targets)) {
        columnIndexes = targets;
      } else if (targets === '_all') {
        columnIndexes = result.map((_, index) => index);
      } else if (typeof targets === 'number') {
        columnIndexes = [targets];
      }

      columnIndexes.forEach(index => {
        if (result[index]) {
          result[index] = { ...result[index], ...defOptions };
        }
      });
    });

    return result;
  });

  const buildServerSideParams = (): ServerSideParams => {
    const cols = finalColumns();
    const sort = sortConfig();

    // Standard DataTable.net server-side parameters
    const params: ServerSideParams = {
      draw: drawCounter(),
      start: (currentPage() - 1) * itemsPerPage(),
      length: itemsPerPage(),
      'search[value]': searchTerm(),
      'search[regex]': false
    };

    // Add column information for proper DataTable.net compatibility
    cols.forEach((column, index) => {
      params[`columns[${index}][data]`] = column.data || index.toString();
      params[`columns[${index}][name]`] = column.data || '';
      params[`columns[${index}][searchable]`] = searching() && column.data != null;
      params[`columns[${index}][orderable]`] = ordering() && column.orderable !== false;
      params[`columns[${index}][search][value]`] = '';
      params[`columns[${index}][search][regex]`] = false;
    });

    // Add ordering if we have a sort configuration
    if (sort.key) {
      const columnIndex = cols.findIndex(col => col.data === sort.key);
      if (columnIndex !== -1) {
        params['order[0][column]'] = columnIndex;
        params['order[0][dir]'] = sort.direction;
      }
    }

    return params;
  };

  // Function to make the actual HTTP request
  const makeRequest = async () => {
    const ajaxConfig = ajax();
    if (!ajaxConfig) return;

    setLoading(true);
    setIsDebouncing(false);

    try {
      const url = typeof ajaxConfig === 'string' ? ajaxConfig : ajaxConfig.url;
      if (!url) return;

      const requestHeaders = {
        'Content-Type': 'application/json',
        ...customHeaders()
      };

      let params: Record<string, any> = {};
      if (serverSide()) {
        params = buildServerSideParams();
      }

      console.log('DataTable request URL:', url, 'params:', params);

      const response = await axios.get(url, {
        headers: requestHeaders,
        params,
      });

      const result = response.data;

      if (serverSide()) {
        if (result.draw && result.draw !== drawCounter()) {
          return;
        }

        setRecordsTotal(result.recordsTotal || 0);
        setRecordsFiltered(result.recordsFiltered || 0);
        setTableData(result.data || []);
      } else {
        let processedData: T[] = [];
        if (Array.isArray(result)) {
          processedData = result;
        } else if (result.data) {
          processedData = result.data;
        }

        if (typeof ajaxConfig === 'object' && typeof ajaxConfig.dataSrc === 'function') {
          processedData = ajaxConfig.dataSrc(result);
        }

        setTableData(processedData);
        setRecordsTotal(processedData.length);
        setRecordsFiltered(processedData.length);
      }

    } catch (error: any) {
      const errorMessage = error.response?.data || error.message || 'Unknown error';
      console.error('DataTable: Failed to load AJAX data:', error.response?.status, errorMessage);
      setTableData([]);
      setRecordsTotal(0);
      setRecordsFiltered(0);
    } finally {
      setLoading(false);
      setIsDebouncing(false);
    }
  };

  // Initial load effect - only runs once on mount
  createEffect(() => {
    if (ajax() && !hasUserInteracted()) {
      makeRequest();
    } else if (data().length > 0) {
      setTableData(data());
      setRecordsTotal(data().length);
      setRecordsFiltered(data().length);
    }
  });

  // Separate effect for tracking user interactions and triggering debounced requests
  let debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    // Establish reactive tracking
    void searchTerm();
    void currentPage();
    void itemsPerPage();
    void sortConfig();

    if (!serverSide() || !ajax() || !hasUserInteracted()) return;

    if (debounceTimeoutId !== null) {
      clearTimeout(debounceTimeoutId);
    }

    setIsDebouncing(true);

    debounceTimeoutId = setTimeout(() => {
      setDrawCounter(prev => prev + 1);
      makeRequest();
      debounceTimeoutId = null;
    }, debounceDelay());
  });

  // Cleanup effect - clear any pending timers when component unmounts
  createEffect(() => {
    return () => {
      if (debounceTimeoutId !== null) {
        clearTimeout(debounceTimeoutId);
        debounceTimeoutId = null;
      }
    };
  });

  const filteredData = createMemo(() => {
    if (serverSide() || !searching() || !searchTerm()) return tableData();

    return tableData().filter(row =>
      Object.values(row).some(value =>
        String(value).toLowerCase().includes(searchTerm().toLowerCase())
      )
    );
  });

  const sortedData = createMemo(() => {
    if (serverSide()) return filteredData();

    const config = sortConfig();
    if (!ordering() || !config.key) return filteredData();

    return [...filteredData()].sort((a, b) => {
      const aVal = a[config.key!];
      const bVal = b[config.key!];

      if (aVal < bVal) return config.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
  });

  const paginatedData = createMemo(() => {
    if (serverSide() || !paging()) return sortedData();

    const startIndex = (currentPage() - 1) * itemsPerPage();
    return sortedData().slice(startIndex, startIndex + itemsPerPage());
  });

  const totalPages = createMemo(() => {
    const items = serverSide() ? recordsFiltered() : sortedData().length;
    return Math.ceil(items / itemsPerPage());
  });

  const displayRecordsTotal = createMemo(() => serverSide() ? recordsTotal() : tableData().length);
  const displayRecordsFiltered = createMemo(() => serverSide() ? recordsFiltered() : sortedData().length);

  const handleSort = (columnKey: keyof T & string) => {
    if (!ordering()) return;

    setHasUserInteracted(true);
    setSortConfig(prev => ({
      key: columnKey,
      direction: (prev.key === columnKey && prev.direction === 'asc' ? 'desc' : 'asc')
    }));

    if (serverSide()) {
      setCurrentPage(1);
      // The debounced effect will handle the request
    }
  };

  const handlePageChange = (newPage: number) => {
    setHasUserInteracted(true);
    setCurrentPage(newPage);
    // The debounced effect will handle the request for server-side
  };

  const handlePageSizeChange = (newSize: number) => {
    setHasUserInteracted(true);
    setItemsPerPage(newSize);
    setCurrentPage(1);
    // The debounced effect will handle the request for server-side
  };

  const handleSearchChange = (value: string) => {
    setHasUserInteracted(true);
    setSearchTerm(value);

    if (serverSide()) {
      setCurrentPage(1);
      // The debounced effect will handle the request
    }
  };

  const renderCell = (column: DataTableColumn<T>, row: T, rowIndex: number): JSX.Element | string => {
    if (column.render) {
      const columnData = column.data ? row[column.data] : null;
      return column.render(columnData, 'display', row, { row: rowIndex, col: finalColumns().indexOf(column) });
    }
    return String(column.data ? row[column.data] || '' : '');
  };

  const getColumnHeader = (column: DataTableColumn<T>) => {
    if (column.title) return column.title;
    if (column.data) return column.data.charAt(0).toUpperCase() + column.data.slice(1);
    return 'Column';
  };

  const isColumnSortable = (column: DataTableColumn<T>) => ordering() && column.orderable !== false && column.data !== null;

  const getSortIcon = (column: DataTableColumn<T>) => {
    const config = sortConfig();
    if (!isColumnSortable(column) || config.key !== column.data) return null;

    return config.direction === 'asc' ?
      <ChevronUp size={14} class="text-amber-400 ml-1" /> :
      <ChevronDown size={14} class="text-amber-400 ml-1" />;
  };

  // Get row class from row data if available
  const getRowClass = (row: T) => {
    if ((row as any)._rowClass) {
      return (row as any)._rowClass;
    }
    return 'border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors';
  };

  return (
    <div class={`bg-zinc-900/50 backdrop-blur-sm rounded-xl border border-zinc-800/50 ${className()}`}>
      <Show when={searching() || headerButtons().length > 0}>
        <div class="p-4 border-b border-zinc-800/50">
          <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-3 lg:space-y-0">
            <Show when={info()}>
              <span class="text-sm text-zinc-400">
                {displayRecordsFiltered()} entries
                <Show when={displayRecordsTotal() !== displayRecordsFiltered()}>
                  {` (filtered from ${displayRecordsTotal()} total)`}
                </Show>
              </span>
            </Show>

            <div class="flex items-center space-x-2">
              <Show when={searching()}>
                <div class="relative">
                  <Search size={16} class="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm()}
                    onInput={(e) => handleSearchChange(e.currentTarget.value)}
                    class="pl-10 pr-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 w-64"
                  />
                </div>
              </Show>

              <For each={headerButtons()}>
                {(button) => (
                  <button
                    onClick={() => button.onClick && button.onClick()}
                    class={button.className || 'bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-2 rounded-lg hover:bg-amber-500/30 transition-colors flex items-center space-x-1'}
                  >
                    <Show when={button.icon}>
                      {(Icon: any) => <Icon size={16} />}
                    </Show>
                    <span class="text-sm">{button.text}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-zinc-800/50">
              <For each={finalColumns()}>
                {(column) => (
                  <th
                    class={`p-4 text-left text-sm font-medium text-zinc-300 transition-colors ${isColumnSortable(column) ? 'cursor-pointer hover:text-white' : ''
                      } ${column.className || ''}`}
                    onClick={() => isColumnSortable(column) && column.data && handleSort(column.data)}
                  >
                    <div class="flex items-center">
                      <span>{getColumnHeader(column)}</span>
                      {getSortIcon(column)}
                    </div>
                  </th>
                )}
              </For>
            </tr>
          </thead>

          <tbody>
            <Show when={loading() || isDebouncing()}>
              <For each={[...Array(itemsPerPage())]}>
                {() => (
                  <tr class="border-b border-zinc-800/30">
                    <For each={finalColumns()}>
                      {() => (
                        <td class="p-3">
                          <div class="animate-pulse bg-zinc-700/50 rounded-md w-full h-6" />
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </Show>

            <Show when={!loading() && !isDebouncing() && paginatedData().length === 0}>
              <tr>
                <td colSpan={finalColumns().length} class="p-12 text-center">
                  <div class="text-zinc-400">
                    {searchTerm() ? 'No data found matching your search.' : 'No data available.'}
                  </div>
                </td>
              </tr>
            </Show>

            <Show when={!loading() && !isDebouncing() && paginatedData().length > 0}>
              <For each={paginatedData()}>
                {(row, rowIndex) => (
                  <tr class={getRowClass(row)}>
                    <For each={finalColumns()}>
                      {(column) => (
                        <td class={`p-4 ${column.className || ''}`}>
                          <div class="text-sm text-white">
                            {renderCell(column, row, rowIndex())}
                          </div>
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>

      <Show when={paging() || info()}>
        <div class="p-4 border-t border-zinc-800/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <Show when={info()}>
                <span class="text-sm text-zinc-400">
                  Showing {paginatedData().length === 0 ? 0 : (currentPage() - 1) * itemsPerPage() + 1} to{' '}
                  {Math.min(currentPage() * itemsPerPage(), serverSide() ? recordsFiltered() : sortedData().length)} of{' '}
                  {displayRecordsFiltered()} entries
                  <Show when={displayRecordsTotal() !== displayRecordsFiltered()}>
                    {` (filtered from ${displayRecordsTotal()} total)`}
                  </Show>
                </span>
              </Show>

              <Show when={paging()}>
                <select
                  value={itemsPerPage()}
                  onChange={(e) => handlePageSizeChange(Number(e.currentTarget.value))}
                  class="bg-zinc-800/50 border border-zinc-700/50 rounded px-3 py-1 text-sm text-white"
                >
                  <For each={lengthMenu()[0]}>
                    {(size, index) => (
                      <option value={size}>
                        {lengthMenu()[1][index()]} per page
                      </option>
                    )}
                  </For>
                </select>
              </Show>
            </div>

            <Show when={paging()}>
              <div class="flex items-center space-x-2">
                <button
                  onClick={() => handlePageChange(Math.max(1, currentPage() - 1))}
                  disabled={currentPage() === 1}
                  class="p-2 bg-zinc-800/50 border border-zinc-700/50 rounded hover:bg-zinc-800/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} class="text-white" />
                </button>

                <span class="text-sm text-zinc-400">
                  Page {currentPage()} of {totalPages()}
                </span>

                <button
                  onClick={() => handlePageChange(Math.min(totalPages(), currentPage() + 1))}
                  disabled={currentPage() === totalPages()}
                  class="p-2 bg-zinc-800/50 border border-zinc-700/50 rounded hover:bg-zinc-800/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} class="text-white" />
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}