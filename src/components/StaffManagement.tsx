import React, { useState, useRef } from 'react';
import { Staff, SalaryHike } from '../types';
import { Users, Plus, Edit2, Trash2, Archive, Calendar, TrendingUp, MapPin, DollarSign, Check, X, GripVertical, Filter, Copy, AlertCircle, RotateCcw, Layers, Briefcase, Upload, Shield, Camera } from 'lucide-react';
import { calculateExperience } from '../utils/salaryCalculations';
import { STATUTORY_DEFINITIONS, defaultConfigFor } from '../utils/statutoryDeductions';
import type { StatutoryDeduction, DeductionBase } from '../types';
import SalaryHikeHistory from './SalaryHikeHistory';
import SalaryHikeDueModal from './SalaryHikeDueModal';
import BulkStaffUpload from './BulkStaffUpload';
import FaceRegistration from './FaceRegistration';
import { settingsService } from '../services/settingsService';
import { salaryCategoryService, type SalaryCategory } from '../services/salaryCategoryService';
import { floorService, type Floor } from '../services/floorService';
import { designationService, type Designation } from '../services/designationService';

interface StaffManagementProps {
  staff: Staff[];
  salaryHikes: SalaryHike[];
  onAddStaff: (staff: Omit<Staff, 'id'>) => void;
  onUpdateStaff: (id: string, staff: Partial<Staff>) => void;
  onDeleteStaff: (id: string, reason: string) => void;
  onUpdateStaffOrder?: (newOrder: Staff[]) => void;
  onRefreshStaff?: () => Promise<void>;
}

const StaffManagement: React.FC<StaffManagementProps> = ({
  staff,
  salaryHikes,
  onAddStaff,
  onUpdateStaff,
  onDeleteStaff,
  onUpdateStaffOrder,
  onRefreshStaff
}) => {
  const formRef = useRef<HTMLDivElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<Staff | null>(null);
  const [showSalaryHistory, setShowSalaryHistory] = useState<Staff | null>(null);
  const [showHikeDueModal, setShowHikeDueModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [faceModalStaff, setFaceModalStaff] = useState<Staff | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [accommodationFilter, setAccommodationFilter] = useState<string>('All');
  const [floorFilter, setFloorFilter] = useState<string>('All');
  const [designationFilter, setDesignationFilter] = useState<string>('All');
  const [experienceSort, setExperienceSort] = useState<'none' | 'asc' | 'desc'>('none');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('staffVisibleColumns');
    if (saved) return JSON.parse(saved);
    return {
      location: true, floor: true, designation: true, experience: true,
      basic: true, incentive: true, hra: true, meal: true, total: true,
      staffType: true, payment: true, bankName: false, accountNo: false,
      ifsc: false, nextHike: false, hikeInterval: false, salaryHistory: true,
      contact: true, address: true, image: true
    };
  });

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => {
      const updated = { ...prev, [col]: !prev[col] };
      localStorage.setItem('staffVisibleColumns', JSON.stringify(updated));
      return updated;
    });
  };

  const columnLabels: Record<string, string> = {
    location: 'Location', floor: 'Floor', designation: 'Designation', experience: 'Experience',
    basic: 'Basic', incentive: 'Incentive', hra: 'HRA', meal: 'Meal Allowance', total: 'Total',
    staffType: 'Staff Type', payment: 'Payment', bankName: 'Bank Name', accountNo: 'Account No',
    ifsc: 'IFSC', nextHike: 'Next Hike', hikeInterval: 'Hike Interval', salaryHistory: 'Salary History',
    contact: 'Contact', address: 'Address', image: 'Image'
  };
  const [draggedItem, setDraggedItem] = useState<Staff | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Settings State
  const [showLocationManager, setShowLocationManager] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showFloorManager, setShowFloorManager] = useState(false);
  const [showDesignationManager, setShowDesignationManager] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [salaryCategories, setSalaryCategories] = useState<SalaryCategory[]>(() => salaryCategoryService.getCategoriesSync());
  const [floors, setFloors] = useState<Floor[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newFloor, setNewFloor] = useState('');
  const [newFloorLocation, setNewFloorLocation] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [editingLocation, setEditingLocation] = useState<{ id: string; name: string } | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);
  const [editingDesignation, setEditingDesignation] = useState<Designation | null>(null);
  const [editLocationValue, setEditLocationValue] = useState('');
  const [editCategoryValue, setEditCategoryValue] = useState('');
  const [editFloorValue, setEditFloorValue] = useState('');
  const [editDesignationValue, setEditDesignationValue] = useState('');

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'location' | 'category' | 'floor' | 'designation';
    id: string;
    name: string;
    action: 'delete' | 'restore';
    isBuiltIn?: boolean;
  } | null>(null);

  // Modal states for viewing full address and image
  const [viewAddressModal, setViewAddressModal] = useState<{ name: string; address: string } | null>(null);
  const [viewImageModal, setViewImageModal] = useState<{ name: string; photo: string } | null>(null);
  const [credentialsModal, setCredentialsModal] = useState<{ credentials: { email: string; password: string }; locationName: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Fetch locations and categories on mount
  React.useEffect(() => {
    const fetchData = async () => {
      const { locationService } = await import('../services/locationService');
      const [locs, cats, flrs, desigs] = await Promise.all([
        locationService.getLocations(),
        salaryCategoryService.getCategories(),
        floorService.getFloors(),
        designationService.getDesignations(),
      ]);
      setLocations(locs);
      setSalaryCategories(cats);
      setFloors(flrs);
      setDesignations(desigs);
    };
    fetchData();
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    floor: '',
    designation: '',
    basicSalary: 15000,
    incentive: 10000,
    hra: 0,
    mealAllowance: 0,
    mealAllowanceThreshold: 0,
    staffAccommodation: '' as '' | 'day_scholar' | 'accommodation',
    joinedDate: new Date().toISOString().split('T')[0],
    salarySupplements: {} as Record<string, number>,
    allowanceCalcModes: {} as Record<string, 'fixed' | 'per_day'>,
    sundayPenalty: true,
    salaryCalculationDays: 30,
    contactNumber: '',
    address: '',
    photo: '',
    bankAccountNumber: '',
    ifscCode: '',
    bankName: '',
    paymentMode: 'cash' as 'cash' | 'bank',
    nextHikeDate: '',
    hikeIntervalMonths: 0,
    statutoryDeductions: {} as Record<string, StatutoryDeduction>,
    pfNumber: '',
    esiNumber: ''
  });

  // Set default location when locations load
  React.useEffect(() => {
    if (locations.length > 0 && !formData.location) {
      setFormData(prev => ({ ...prev, location: locations[0]?.name }));
    }
  }, [locations]);

  // Handle photo upload
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, photo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const activeStaff = staff.filter(member => {
    if (!member.isActive) return false;
    if (locationFilter !== 'All' && member.location !== locationFilter) return false;
    if (accommodationFilter !== 'All') {
      if (accommodationFilter === 'day_scholar' && member.staffAccommodation !== 'day_scholar') return false;
      if (accommodationFilter === 'accommodation' && member.staffAccommodation !== 'accommodation') return false;
      if (accommodationFilter === 'not_set' && member.staffAccommodation) return false;
    }
    if (floorFilter !== 'All' && (member.floor || '') !== floorFilter) return false;
    if (designationFilter !== 'All' && (member.designation || '') !== designationFilter) return false;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const haystack = [
      member.name, member.location, member.floor, member.designation,
      member.experience, member.type, member.staffAccommodation,
      member.contactNumber, member.address, member.bankName, member.bankAccountNumber,
      member.ifscCode, member.pfNumber, member.esiNumber, member.paymentMode,
      String(member.basicSalary ?? ''), String(member.incentive ?? ''),
      String(member.hra ?? ''), String(member.mealAllowance ?? ''), String(member.totalSalary ?? ''),
      member.joinedDate
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  }).sort((a, b) => {
    if (experienceSort === 'none') return 0;
    const parseExp = (exp: string) => {
      const match = exp.match(/(\d+)y\s*(\d+)m/);
      if (match) return parseInt(match[1]) * 12 + parseInt(match[2]);
      const yMatch = exp.match(/(\d+)y/);
      if (yMatch) return parseInt(yMatch[1]) * 12;
      const mMatch = exp.match(/(\d+)m/);
      if (mMatch) return parseInt(mMatch[1]);
      return 0;
    };
    const aJoined = new Date(a.joinedDate).getTime();
    const bJoined = new Date(b.joinedDate).getTime();
    // Earlier joined = more experience
    return experienceSort === 'asc' ? bJoined - aJoined : aJoined - bJoined;
  });

  const handleCreateLocation = async () => {
    if (newLocation.trim()) {
      const { locationService } = await import('../services/locationService');
      const result = await locationService.addLocation(newLocation.trim());
      if (result.location) {
        setLocations(prev => [...prev, result.location!]);
        setNewLocation('');
        if (result.credentials) {
          setCredentialsModal({
            credentials: result.credentials,
            locationName: result.location.name
          });
        }
      }
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleUpdateLocation = async (id: string) => {
    if (editLocationValue.trim()) {
      const { locationService } = await import('../services/locationService');
      const oldLocation = locations.find(l => l.id === id)?.name;
      const updated = await locationService.updateLocation(id, editLocationValue.trim());
      if (updated) {
        setLocations(prev => prev.map(l => l.id === id ? updated : l));
        setEditingLocation(null);
        setEditLocationValue('');
        if (oldLocation && oldLocation !== updated.name && onRefreshStaff) {
          await onRefreshStaff();
        }
      }
    }
  };

  const handleDeleteLocation = async (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (!loc) return;
    setConfirmDialog({ type: 'location', id, name: loc.name, action: 'delete' });
  };

  const confirmLocationDelete = async () => {
    if (!confirmDialog || confirmDialog.type !== 'location') return;
    const { locationService } = await import('../services/locationService');
    const success = await locationService.deleteLocation(confirmDialog.id);
    if (success) {
      setLocations(prev => prev.filter(l => l.id !== confirmDialog.id));
    }
    setConfirmDialog(null);
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    const cat = await salaryCategoryService.addCategory(newCategory.trim());
    if (cat) {
      setSalaryCategories(await salaryCategoryService.getCategories());
      setNewCategory('');
    }
  };

  const handleSaveCategoryEdit = async (id: string) => {
    if (!editCategoryValue.trim()) return;
    await salaryCategoryService.updateCategory(id, editCategoryValue.trim());
    setSalaryCategories(await salaryCategoryService.getCategories());
    setEditingCategory(null);
  };

  const handleDeleteCategory = (cat: SalaryCategory) => {
    setConfirmDialog({
      type: 'category',
      id: cat.id,
      name: cat.name,
      action: cat.isDeleted ? 'restore' : 'delete',
      isBuiltIn: cat.isBuiltIn
    });
  };

  const confirmCategoryAction = async () => {
    if (!confirmDialog || confirmDialog.type !== 'category') return;
    if (confirmDialog.action === 'restore') {
      await salaryCategoryService.restoreCategory(confirmDialog.id);
    } else {
      if (confirmDialog.isBuiltIn) {
        // Built-in categories: soft-delete via deactivation
        await salaryCategoryService.softDeleteCategory(confirmDialog.id);
      } else {
        await salaryCategoryService.softDeleteCategory(confirmDialog.id);
      }
    }
    setSalaryCategories(await salaryCategoryService.getCategories());
    setConfirmDialog(null);
  };

  // Floor handlers
  const handleAddFloor = async () => {
    if (!newFloor.trim() || !newFloorLocation) return;
    const floor = await floorService.addFloor(newFloorLocation, newFloor.trim());
    if (floor) {
      setFloors(prev => [...prev, floor]);
      setNewFloor('');
    }
  };

  const handleUpdateFloor = async (id: string) => {
    if (!editFloorValue.trim()) return;
    const updated = await floorService.updateFloor(id, editFloorValue.trim());
    if (updated) {
      setFloors(prev => prev.map(f => f.id === id ? updated : f));
      setEditingFloor(null);
    }
  };

  const handleDeleteFloor = (floor: Floor) => {
    setConfirmDialog({ type: 'floor', id: floor.id, name: floor.name, action: 'delete' });
  };

  const confirmFloorDelete = async () => {
    if (!confirmDialog || confirmDialog.type !== 'floor') return;
    await floorService.deleteFloor(confirmDialog.id);
    setFloors(prev => prev.filter(f => f.id !== confirmDialog.id));
    setConfirmDialog(null);
  };

  // Designation handlers
  const handleAddDesignation = async () => {
    if (!newDesignation.trim()) return;
    const desig = await designationService.addDesignation(newDesignation.trim());
    if (desig) {
      setDesignations(prev => [...prev, desig]);
      setNewDesignation('');
    }
  };

  const handleUpdateDesignation = async (id: string) => {
    if (!editDesignationValue.trim()) return;
    const updated = await designationService.updateDesignation(id, editDesignationValue.trim());
    if (updated) {
      setDesignations(prev => prev.map(d => d.id === id ? updated : d));
      setEditingDesignation(null);
    }
  };

  const handleDeleteDesignation = (desig: Designation) => {
    setConfirmDialog({ type: 'designation', id: desig.id, name: desig.displayName, action: 'delete' });
  };

  const confirmDesignationDelete = async () => {
    if (!confirmDialog || confirmDialog.type !== 'designation') return;
    await designationService.deleteDesignation(confirmDialog.id);
    setDesignations(prev => prev.filter(d => d.id !== confirmDialog.id));
    setConfirmDialog(null);
  };

  const handleDragStart = (e: React.DragEvent, member: Staff) => {
    setDraggedItem(member);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', member.id);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedItem(null);
    setDragOverIndex(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const calculateMemberTotalSalary = (member: Staff) => {
    let total = member.basicSalary + member.incentive + member.hra + (member.mealAllowance || 0);
    const customCategories = salaryCategories.filter(c => !['basic', 'incentive', 'hra', 'meal_allowance'].includes(c.id) && !c.isDeleted);
    total += customCategories.reduce((sum, cat) => sum + (member.salarySupplements?.[cat.id] || member.salarySupplements?.[cat.key] || 0), 0);
    return total;
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (!draggedItem || !onUpdateStaffOrder) return;
    const dragIndex = activeStaff.findIndex(s => s.id === draggedItem.id);
    if (dragIndex === -1 || dragIndex === dropIndex) {
      setDraggedItem(null);
      setDragOverIndex(null);
      return;
    }
    const newOrder = [...activeStaff];
    const [removed] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    const inactiveStaff = staff.filter(s => !s.isActive);
    const fullNewOrder = [...newOrder, ...inactiveStaff];
    onUpdateStaffOrder(fullNewOrder);
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      location: locations[0]?.name || 'Big Shop',
      floor: '',
      designation: '',
      basicSalary: 15000,
      incentive: 10000,
      hra: 0,
      mealAllowance: 0,
      mealAllowanceThreshold: 0,
      staffAccommodation: '',
      joinedDate: new Date().toISOString().split('T')[0],
      salarySupplements: {},
      allowanceCalcModes: {},
      sundayPenalty: true,
      salaryCalculationDays: 30,
      contactNumber: '',
      address: '',
      photo: '',
      bankAccountNumber: '',
      ifscCode: '',
      bankName: '',
      paymentMode: 'cash',
      nextHikeDate: '',
      hikeIntervalMonths: 0,
      statutoryDeductions: {},
      pfNumber: '',
      esiNumber: ''
    });
  };

  const activeCustomCategories = salaryCategories.filter(c => !['basic', 'incentive', 'hra', 'meal_allowance'].includes(c.id) && !c.isDeleted);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phoneDigits = formData.contactNumber.replace(/[^0-9]/g, '');
    if (phoneDigits.length !== 10) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }

    let totalSalary = (formData.basicSalary || 0) + (formData.incentive || 0) + (formData.hra || 0) + (formData.mealAllowance || 0);
    totalSalary += activeCustomCategories.reduce((sum, cat) => sum + (formData.salarySupplements[cat.id] || formData.salarySupplements[cat.key] || 0), 0);

    const experience = calculateExperience(formData.joinedDate);

    if (editingStaff) {
      settingsService.updateStaffSupplement(editingStaff.id, formData.salarySupplements);
      onUpdateStaff(editingStaff.id, {
        ...formData,
        totalSalary,
        experience,
        type: 'full-time',
        sundayPenalty: formData.sundayPenalty,
        allowanceCalcModes: formData.allowanceCalcModes,
        mealAllowanceThreshold: formData.mealAllowanceThreshold,
        staffAccommodation: formData.staffAccommodation,
        bankAccountNumber: formData.bankAccountNumber,
        ifscCode: formData.ifscCode,
        bankName: formData.bankName,
        paymentMode: formData.paymentMode,
        nextHikeDate: formData.nextHikeDate || undefined,
        hikeIntervalMonths: formData.hikeIntervalMonths || undefined,
        statutoryDeductions: formData.statutoryDeductions,
        pfNumber: formData.pfNumber || undefined,
        esiNumber: formData.esiNumber || undefined
      });
      setEditingStaff(null);
    } else {
      onAddStaff({
        ...formData,
        totalSalary,
        type: 'full-time',
        isActive: true,
        experience
      });
    }
    resetForm();
    setShowAddForm(false);
  };

  const handleEdit = async (member: Staff) => {
    const { locationService } = await import('../services/locationService');
    const freshLocations = await locationService.getLocations();
    setLocations(freshLocations);

    const supplements = member.salarySupplements || {};
    setFormData({
      name: member.name,
      location: member.location,
      floor: member.floor || '',
      designation: member.designation || '',
      basicSalary: member.basicSalary,
      incentive: member.incentive,
      hra: member.hra,
      mealAllowance: member.mealAllowance || 0,
      mealAllowanceThreshold: member.mealAllowanceThreshold || 0,
      staffAccommodation: member.staffAccommodation || '',
      joinedDate: member.joinedDate,
      salarySupplements: supplements,
      allowanceCalcModes: member.allowanceCalcModes || {},
      sundayPenalty: member.sundayPenalty ?? true,
      salaryCalculationDays: member.salaryCalculationDays || 30,
      contactNumber: member.contactNumber || '',
      address: member.address || '',
      photo: member.photo || '',
      bankAccountNumber: member.bankAccountNumber || '',
      ifscCode: member.ifscCode || '',
      bankName: member.bankName || '',
      paymentMode: member.paymentMode || 'cash',
      nextHikeDate: member.nextHikeDate || '',
      hikeIntervalMonths: member.hikeIntervalMonths || 0,
      statutoryDeductions: member.statutoryDeductions || {},
      pfNumber: member.pfNumber || '',
      esiNumber: member.esiNumber || ''
    });
    setEditingStaff(member);
    setShowAddForm(true);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleDelete = (member: Staff) => {
    setShowDeleteModal(member);
    setDeleteReason('');
  };

  const confirmDelete = () => {
    if (showDeleteModal && deleteReason.trim()) {
      onDeleteStaff(showDeleteModal.id, deleteReason.trim());
      setShowDeleteModal(null);
      setDeleteReason('');
    }
  };

  const getLocationColor = (location: string): string => {
    const colors: Record<string, string> = {
      'Big Shop': 'badge-premium badge-info',
      'Small Shop': 'badge-premium badge-success',
      'Godown': 'badge-premium badge-purple'
    };
    return colors[location] || 'badge-premium badge-neutral';
  };

  const getStaffSalaryHikes = (staffId: string) => {
    return salaryHikes
      .filter(hike => hike.staffId === staffId)
      .sort((a, b) => new Date(b.hikeDate).getTime() - new Date(a.hikeDate).getTime());
  };

  return (
    <div className="p-1 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="stat-icon stat-icon-primary">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Staff Management</h1>
            <p className="text-white/50 text-sm">Manage your team members</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1 sm:min-w-[200px] md:min-w-[300px]">
            <input
              type="text"
              placeholder="Search by name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-premium"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowLocationManager(true)}
              className="btn-premium flex items-center gap-2 px-3 py-2 text-sm"
              style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' }}
              title="Manage Locations"
            >
              <MapPin size={16} />
              <span className="hidden sm:inline">Locations</span>
            </button>
            <button
              onClick={() => setShowFloorManager(true)}
              className="btn-premium flex items-center gap-2 px-3 py-2 text-sm"
              style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' }}
              title="Manage Floors"
            >
              <Layers size={16} />
              <span className="hidden sm:inline">Floors</span>
            </button>
            <button
              onClick={() => setShowDesignationManager(true)}
              className="btn-premium flex items-center gap-2 px-3 py-2 text-sm"
              style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}
              title="Manage Designations"
            >
              <Briefcase size={16} />
              <span className="hidden sm:inline">Designations</span>
            </button>
            <button
              onClick={() => setShowCategoryManager(true)}
              className="btn-premium btn-premium-success flex items-center gap-2 px-3 py-2 text-sm"
              title="Manage Salary Categories"
            >
              <DollarSign size={16} />
              <span className="hidden sm:inline">Categories</span>
            </button>
            <button
              onClick={() => setShowBulkImport(true)}
              className="btn-premium btn-premium-success flex items-center gap-2 px-3 py-2 text-sm"
              title="Bulk Import Staff from Excel"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Bulk Import</span>
            </button>
            <button
              onClick={() => {
                resetForm();
                setEditingStaff(null);
                setShowAddForm(!showAddForm);
              }}
              className="btn-premium flex items-center gap-2 px-4 py-2"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Add Staff</span>
            </button>
          </div>
        </div>
      </div>

      {/* Salary Hike Due Banner */}
      {(() => {
        const staffDueForHike = activeStaff.filter(member => {
          const joinedDate = new Date(member.joinedDate);
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          if (joinedDate > oneYearAgo) return false;
          const memberHikes = getStaffSalaryHikes(member.id);
          if (memberHikes.length === 0) return true;
          const lastHikeDate = new Date(memberHikes[0].hikeDate);
          return lastHikeDate <= oneYearAgo;
        });
        if (staffDueForHike.length === 0) return null;
        return (
          <div onClick={() => setShowHikeDueModal(true)} className="glass-card-static p-4 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors border-l-4 border-amber-500">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-full">
                <TrendingUp className="text-amber-400" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-amber-400">Salary Hike Due</h3>
                <p className="text-sm text-white/60">
                  {staffDueForHike.length} staff member{staffDueForHike.length !== 1 ? 's are' : ' is'} eligible for a salary hike
                </p>
              </div>
            </div>
            <span className="text-amber-400 text-sm font-medium">Click to view →</span>
          </div>
        );
      })()}

      {showHikeDueModal && (
        <SalaryHikeDueModal
          staff={staff}
          salaryHikes={salaryHikes}
          onClose={() => setShowHikeDueModal(false)}
        />
      )}

      {/* Filter Bar */}
      <div className="glass-card-static p-4 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-white/60">
            <Filter size={18} />
            <span className="font-medium">Location:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setLocationFilter('All')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${locationFilter === 'All'
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
            >
              All ({staff.filter(s => s.isActive).length})
            </button>
            {locations.map(loc => {
              const count = staff.filter(s => s.isActive && s.location === loc.name).length;
              return (
                <button
                  key={loc.id}
                  onClick={() => setLocationFilter(loc.name)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${locationFilter === loc.name
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                >
                  {loc.name} ({count})
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-white/60">
            <span className="font-medium text-sm">Accommodation:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['All', 'day_scholar', 'accommodation'].map(val => (
              <button
                key={val}
                onClick={() => setAccommodationFilter(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${accommodationFilter === val
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
              >
                {val === 'All' ? 'All' : val === 'day_scholar' ? 'Day Scholar' : 'Accommodation'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-white/60 ml-4">
            <span className="font-medium text-sm">Floor:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFloorFilter('All')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${floorFilter === 'All'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
            >
              All
            </button>
            {Array.from(new Set(staff.filter(s => s.isActive && s.floor).map(s => s.floor!))).map(flr => (
              <button
                key={flr}
                onClick={() => setFloorFilter(flr)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${floorFilter === flr
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
              >
                {flr}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-white/60">
            <span className="font-medium text-sm">Designation:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setDesignationFilter('All')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${designationFilter === 'All'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
            >
              All
            </button>
            {Array.from(new Set(staff.filter(s => s.isActive && s.designation).map(s => s.designation!))).map(des => (
              <button
                key={des}
                onClick={() => setDesignationFilter(des)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${designationFilter === des
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
              >
                {des}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Add/Edit Staff Form */}
      {showAddForm && (
        <div ref={formRef} className="glass-card-static p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Name</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-premium" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Location</label>
              <select value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="input-premium">
                {locations.map(loc => (<option key={loc.id} value={loc.name}>{loc.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Floor</label>
              <select value={formData.floor} onChange={(e) => setFormData({ ...formData, floor: e.target.value })} className="input-premium">
                <option value="">No Floor</option>
                {floors.filter(f => f.locationName === formData.location).map(f => (<option key={f.id} value={f.name}>{f.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Designation</label>
              <select value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} className="input-premium">
                <option value="">No Designation</option>
                {designations.map(d => (<option key={d.id} value={d.displayName}>{d.displayName}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Joined Date</label>
              <input type="date" value={formData.joinedDate} onChange={(e) => setFormData({ ...formData, joinedDate: e.target.value })} className="input-premium" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Mobile Number <span className="text-red-400">*</span></label>
              <input
                type="tel"
                value={formData.contactNumber}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                  setFormData({ ...formData, contactNumber: digits });
                }}
                className="input-premium" placeholder="10-digit mobile number" required pattern="[0-9]{10}" maxLength={10}
                title="Enter 10-digit mobile number (required for WhatsApp)"
              />
              <p className="text-xs text-white/50 mt-1">Required for WhatsApp salary slip</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Address</label>
              <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="input-premium" placeholder="Full address" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-white/70 mb-1">Image</label>
              <div className="flex items-center gap-3">
                {formData.photo ? (
                  <img src={formData.photo} alt="Preview" className="w-12 h-12 rounded-full object-cover border-2 border-white/30" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/40"><Users size={20} /></div>
                )}
                <label className="cursor-pointer bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
                  Upload
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>
                {formData.photo && (
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, photo: '' }))} className="text-red-400 hover:text-red-300 px-2 py-1 text-xs rounded border border-red-400/50 hover:border-red-300">Remove</button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                {salaryCategories.find(c => c.id === 'basic')?.name || 'Basic Salary'}
              </label>
              <input type="number" value={formData.basicSalary} onChange={(e) => setFormData({ ...formData, basicSalary: Number(e.target.value) })} className="input-premium" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                {salaryCategories.find(c => c.id === 'incentive')?.name || 'Incentive'}
              </label>
              <input type="number" value={formData.incentive} onChange={(e) => setFormData({ ...formData, incentive: Number(e.target.value) })} className="input-premium" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                {salaryCategories.find(c => c.id === 'hra')?.name || 'HRA'}
              </label>
              <input type="number" value={formData.hra} onChange={(e) => setFormData({ ...formData, hra: Number(e.target.value) })} className="input-premium" />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                {salaryCategories.find(c => c.id === 'meal_allowance')?.name || 'Meal Allowance'}
              </label>
              <input type="number" value={formData.mealAllowance} onChange={(e) => setFormData({ ...formData, mealAllowance: Number(e.target.value) })} className="input-premium" />
              <div className="mt-1.5 space-y-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.allowanceCalcModes['meal_allowance'] === 'per_day'}
                    onChange={(e) => setFormData({
                      ...formData,
                      allowanceCalcModes: {
                        ...formData.allowanceCalcModes,
                        meal_allowance: e.target.checked ? 'per_day' : 'fixed'
                      }
                    })}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-white/30 bg-white/10"
                  />
                  <span className="text-xs text-white/50">Calculate per day present</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Fixed if present ≥</span>
                  <input
                    type="number"
                    value={formData.mealAllowanceThreshold}
                    onChange={(e) => setFormData({ ...formData, mealAllowanceThreshold: Number(e.target.value) })}
                    className="input-premium w-16 text-xs px-2 py-1"
                    min="0"
                    max="31"
                    placeholder="0"
                  />
                  <span className="text-xs text-white/50">days (0=off)</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Staff Type</label>
              <select
                value={formData.staffAccommodation}
                onChange={(e) => setFormData({ ...formData, staffAccommodation: e.target.value as '' | 'day_scholar' | 'accommodation' })}
                className="input-premium"
              >
                <option value="">Not Set</option>
                <option value="day_scholar">Day Scholar</option>
                <option value="accommodation">Accommodation Provided</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Salary Calculation Days</label>
              <input type="number" value={formData.salaryCalculationDays} onChange={(e) => setFormData({ ...formData, salaryCalculationDays: Number(e.target.value) })} className="input-premium" min="0" max="31" />
              <p className="text-xs text-white/40 mt-0.5">0 = Fixed salary</p>
            </div>
            <div className="flex items-center h-full pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.sundayPenalty} onChange={(e) => setFormData({ ...formData, sundayPenalty: e.target.checked })} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-white/30 bg-white/10" />
                <span className="text-sm font-medium text-white/70">Apply Sunday Penalty</span>
              </label>
            </div>

            {activeCustomCategories.map(category => (
              <div key={category.id}>
                <label className="block text-sm font-medium text-white/70 mb-1">{category.name}</label>
                <input
                  type="number"
                  value={formData.salarySupplements[category.id] || formData.salarySupplements[category.key] || 0}
                  onChange={(e) => setFormData({
                    ...formData,
                    salarySupplements: {
                      ...formData.salarySupplements,
                      [category.id]: Number(e.target.value),
                      [category.key]: Number(e.target.value)
                    }
                  })}
                  className="input-premium"
                />
                <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.allowanceCalcModes[category.id] === 'per_day'}
                    onChange={(e) => setFormData({
                      ...formData,
                      allowanceCalcModes: {
                        ...formData.allowanceCalcModes,
                        [category.id]: e.target.checked ? 'per_day' : 'fixed'
                      }
                    })}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-white/30 bg-white/10"
                  />
                  <span className="text-xs text-white/50">Calculate per day present</span>
                </label>
              </div>
            ))}

            {/* Bank Details */}
            <div className="md:col-span-2 lg:col-span-3">
              <h3 className="text-sm font-semibold text-white/60 mb-3 border-b border-white/10 pb-2">💳 Bank & Payment Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Payment Mode</label>
                  <select
                    value={formData.paymentMode}
                    onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value as 'cash' | 'bank' })}
                    className="input-premium"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Bank Name</label>
                  <input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="input-premium" placeholder="e.g. SBI, HDFC" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Account Number</label>
                  <input type="text" value={formData.bankAccountNumber} onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })} className="input-premium" placeholder="Account number" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">IFSC Code</label>
                  <input type="text" value={formData.ifscCode} onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })} className="input-premium" placeholder="e.g. SBIN0001234" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">PF Number <span className="text-white/30 text-xs">(optional)</span></label>
                  <input type="text" value={formData.pfNumber} onChange={(e) => setFormData({ ...formData, pfNumber: e.target.value })} className="input-premium" placeholder="e.g. AB/CDE/1234567/000/0000001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">ESI Number <span className="text-white/30 text-xs">(optional)</span></label>
                  <input type="text" value={formData.esiNumber} onChange={(e) => setFormData({ ...formData, esiNumber: e.target.value })} className="input-premium" placeholder="e.g. 1234567890" />
                </div>
              </div>
            </div>
            </div>

            {/* Hike Scheduling */}
            <div className="md:col-span-2 lg:col-span-3">
              <h3 className="text-sm font-semibold text-white/60 mb-3 border-b border-white/10 pb-2">📅 Salary Hike Schedule (Override)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Next Hike Date</label>
                  <input type="date" value={formData.nextHikeDate} onChange={(e) => setFormData({ ...formData, nextHikeDate: e.target.value })} className="input-premium" />
                  <p className="text-xs text-white/40 mt-0.5">Leave empty to use default interval</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Hike Interval (months)</label>
                  <input type="number" value={formData.hikeIntervalMonths} onChange={(e) => setFormData({ ...formData, hikeIntervalMonths: Number(e.target.value) })} className="input-premium" min="0" placeholder="0 = use default" />
                  <p className="text-xs text-white/40 mt-0.5">0 = use global default from Settings</p>
                </div>
              </div>
            </div>

            {/* Statutory / Government Deductions */}
            <div className="md:col-span-2 lg:col-span-3">
              <h3 className="text-sm font-semibold text-white/60 mb-3 border-b border-white/10 pb-2 flex items-center gap-2">
                <Shield size={16} className="text-emerald-400" />
                Statutory Deductions (ESI / PF / PT / TDS / Custom)
              </h3>
              <p className="text-xs text-white/40 mb-3">Toggle each deduction per staff. Choose government default % or set a custom % / fixed amount.</p>

              <div className="space-y-2">
                {STATUTORY_DEFINITIONS.map(def => {
                  const cfg = formData.statutoryDeductions[def.key];
                  const enabled = !!cfg?.enabled;
                  const update = (next: Partial<StatutoryDeduction>) => {
                    const merged: StatutoryDeduction = {
                      ...defaultConfigFor(def.key),
                      ...(cfg || {}),
                      ...next,
                    };
                    setFormData({
                      ...formData,
                      statutoryDeductions: { ...formData.statutoryDeductions, [def.key]: merged }
                    });
                  };
                  return (
                    <div key={def.key} className="glass-card-static p-3 rounded-lg">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer min-w-[110px]">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => update({ enabled: e.target.checked })}
                            className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-white/30 bg-white/10"
                          />
                          <span className="text-sm font-semibold text-white">{def.label}</span>
                        </label>
                        <span className="text-xs text-white/40 flex-1 min-w-[140px]">{def.description}</span>

                        {enabled && (
                          <>
                            <select
                              value={cfg?.base || def.defaultBase}
                              onChange={(e) => update({ base: e.target.value as DeductionBase })}
                              className="input-premium text-xs py-1 px-2 w-auto"
                            >
                              <option value="basic">% of Basic</option>
                              <option value="basic_hra">% of Basic+HRA</option>
                              <option value="gross">% of Gross</option>
                              <option value="fixed">Fixed Amount</option>
                            </select>

                            {(cfg?.base || def.defaultBase) === 'fixed' ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-white/50">₹</span>
                                <input
                                  type="number"
                                  value={cfg?.fixedAmount ?? 0}
                                  onChange={(e) => update({ fixedAmount: Number(e.target.value) })}
                                  className="input-premium w-24 text-xs py-1 px-2"
                                  min="0"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={cfg?.percentage ?? def.defaultPercentage}
                                  onChange={(e) => update({ percentage: Number(e.target.value) })}
                                  className="input-premium w-20 text-xs py-1 px-2"
                                  min="0"
                                />
                                <span className="text-xs text-white/50">%</span>
                                <button
                                  type="button"
                                  onClick={() => update({ percentage: def.defaultPercentage, base: def.defaultBase })}
                                  className="text-[10px] text-indigo-300 hover:text-indigo-200 underline"
                                  title={`Reset to government default (${def.defaultPercentage}% on ${def.defaultBase})`}
                                >
                                  default
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Custom deductions */}
                {Object.entries(formData.statutoryDeductions)
                  .filter(([k]) => !STATUTORY_DEFINITIONS.some(d => d.key === k))
                  .map(([key, cfg]) => {
                    const update = (next: Partial<StatutoryDeduction>) => {
                      setFormData({
                        ...formData,
                        statutoryDeductions: { ...formData.statutoryDeductions, [key]: { ...cfg, ...next } }
                      });
                    };
                    const remove = () => {
                      const copy = { ...formData.statutoryDeductions };
                      delete copy[key];
                      setFormData({ ...formData, statutoryDeductions: copy });
                    };
                    return (
                      <div key={key} className="glass-card-static p-3 rounded-lg border border-amber-500/20">
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            type="checkbox"
                            checked={cfg.enabled}
                            onChange={(e) => update({ enabled: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <input
                            type="text"
                            value={cfg.name || ''}
                            onChange={(e) => update({ name: e.target.value })}
                            placeholder="Name (e.g. LWF, Loan)"
                            className="input-premium text-xs py-1 px-2 w-40"
                          />
                          <select
                            value={cfg.base}
                            onChange={(e) => update({ base: e.target.value as DeductionBase })}
                            className="input-premium text-xs py-1 px-2 w-auto"
                          >
                            <option value="basic">% of Basic</option>
                            <option value="basic_hra">% of Basic+HRA</option>
                            <option value="gross">% of Gross</option>
                            <option value="fixed">Fixed Amount</option>
                          </select>
                          {cfg.base === 'fixed' ? (
                            <input type="number" value={cfg.fixedAmount ?? 0} min="0"
                              onChange={(e) => update({ fixedAmount: Number(e.target.value) })}
                              className="input-premium w-24 text-xs py-1 px-2" />
                          ) : (
                            <div className="flex items-center gap-1">
                              <input type="number" step="0.01" value={cfg.percentage ?? 0} min="0"
                                onChange={(e) => update({ percentage: Number(e.target.value) })}
                                className="input-premium w-20 text-xs py-1 px-2" />
                              <span className="text-xs text-white/50">%</span>
                            </div>
                          )}
                          <button type="button" onClick={remove} className="ml-auto text-red-400 hover:text-red-300">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                <button
                  type="button"
                  onClick={() => {
                    const newKey = `custom_${Date.now()}`;
                    setFormData({
                      ...formData,
                      statutoryDeductions: {
                        ...formData.statutoryDeductions,
                        [newKey]: { enabled: true, percentage: 0, base: 'fixed', fixedAmount: 0, name: '' }
                      }
                    });
                  }}
                  className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Custom Deduction
                </button>
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-3 flex gap-3">
              <button type="submit" className="btn-premium px-6 py-2">{editingStaff ? 'Update Staff' : 'Add Staff'}</button>
              <button type="button" onClick={() => { resetForm(); setEditingStaff(null); setShowAddForm(false); }} className="btn-ghost px-6 py-2">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Archive className="text-red-400" size={20} />
              Archive Staff Member
            </h3>
            <p className="text-white/60 mb-4">
              Are you sure you want to archive <strong className="text-white">{showDeleteModal.name}</strong>?
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-white/70 mb-2">Reason *</label>
              <textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Enter reason for archiving..." className="input-premium w-full" rows={3} />
            </div>
            <div className="flex gap-3">
              <button onClick={confirmDelete} disabled={!deleteReason.trim()} className="flex-1 btn-premium btn-premium-danger disabled:opacity-50 disabled:cursor-not-allowed">Archive</button>
              <button onClick={() => setShowDeleteModal(null)} className="flex-1 btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Salary History Modal */}
      {showSalaryHistory && (
        <div className="modal-overlay">
          <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="text-emerald-400" size={24} />
                Salary Hike History
              </h3>
              <button onClick={() => setShowSalaryHistory(null)} className="text-white/50 hover:text-white">✕</button>
            </div>
            <SalaryHikeHistory
              salaryHikes={getStaffSalaryHikes(showSalaryHistory.id)}
              staffName={showSalaryHistory.name}
              currentSalary={showSalaryHistory.totalSalary}
              staff={showSalaryHistory}
              onRefresh={onRefreshStaff}
            />
            <div className="mt-6 flex justify-end">
              <button onClick={() => setShowSalaryHistory(null)} className="btn-ghost px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Table */}
      <div className="table-container">
        <div className="p-4 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-white">
            Active Staff ({activeStaff.length})
            {locationFilter !== 'All' && <span className="text-indigo-400 ml-2">- {locationFilter}</span>}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExperienceSort(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none')}
              className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1 ${experienceSort !== 'none' ? 'text-blue-400' : ''}`}
            >
              Exp {experienceSort === 'desc' ? '↓' : experienceSort === 'asc' ? '↑' : '↕'}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1"
              >
                <Filter size={14} /> Columns
              </button>
              {showColumnPicker && (
                <div className="absolute right-0 top-full mt-1 z-50 glass-card-static p-3 rounded-xl shadow-xl min-w-[200px] max-h-[400px] overflow-y-auto">
                  <p className="text-xs font-semibold text-white/70 mb-2">Show/Hide Columns</p>
                  {Object.entries(columnLabels).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-white/80 hover:text-white">
                      <input type="checkbox" checked={visibleColumns[key] !== false} onChange={() => toggleColumn(key)} className="rounded" />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {onUpdateStaffOrder && (
              <span className="text-xs text-white/50 flex items-center gap-1">
                <GripVertical size={14} />
                Drag rows to reorder
              </span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-premium">
            <thead>
              <tr>
                <th className="w-10"></th>
                <th className="text-center">S.No</th>
                <th className="sticky left-0">Name</th>
                {visibleColumns.location !== false && <th className="text-center">Location</th>}
                {visibleColumns.floor !== false && <th className="text-center">Floor</th>}
                {visibleColumns.designation !== false && <th className="text-center">Designation</th>}
                {visibleColumns.experience !== false && <th className="text-center">Experience</th>}
                {visibleColumns.basic !== false && <th className="text-center">{salaryCategories.find(c => c.id === 'basic')?.name || 'Basic'}</th>}
                {visibleColumns.incentive !== false && <th className="text-center">{salaryCategories.find(c => c.id === 'incentive')?.name || 'Incentive'}</th>}
                {visibleColumns.hra !== false && <th className="text-center">{salaryCategories.find(c => c.id === 'hra')?.name || 'HRA'}</th>}
                {visibleColumns.meal !== false && <th className="text-center">{salaryCategories.find(c => c.id === 'meal_allowance')?.name || 'Meal Allowance'}</th>}
                {activeCustomCategories.map(category => (
                  <th key={category.id} className="text-center">{category.name}</th>
                ))}
                {visibleColumns.total !== false && <th className="text-center">Total</th>}
                {visibleColumns.staffType !== false && <th className="text-center">Staff Type</th>}
                {visibleColumns.payment !== false && <th className="text-center">Payment</th>}
                {visibleColumns.bankName !== false && <th className="text-center">Bank Name</th>}
                {visibleColumns.accountNo !== false && <th className="text-center">Account No</th>}
                {visibleColumns.ifsc !== false && <th className="text-center">IFSC</th>}
                {visibleColumns.nextHike !== false && <th className="text-center">Next Hike</th>}
                {visibleColumns.hikeInterval !== false && <th className="text-center">Hike Interval</th>}
                {visibleColumns.salaryHistory !== false && <th className="text-center">Salary History</th>}
                {visibleColumns.contact !== false && <th className="text-center">Contact</th>}
                {visibleColumns.address !== false && <th className="text-center">Address</th>}
                {visibleColumns.image !== false && <th className="text-center">Image</th>}
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeStaff.map((member, index) => {
                const memberHikes = getStaffSalaryHikes(member.id);
                const hasHikes = memberHikes.length > 0;
                const isDragOver = dragOverIndex === index;
                const isDragging = draggedItem?.id === member.id;

                return (
                  <tr
                    key={member.id}
                    className={`hover:bg-gray-50 cursor-pointer ${isDragOver ? 'bg-blue-50' : ''} ${isDragging ? 'opacity-50' : ''}`}
                    draggable={!!onUpdateStaffOrder}
                    onDragStart={(e) => handleDragStart(e, member)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={(e) => {
                      // Don't trigger edit if clicking on a button, link or interactive element
                      const target = e.target as HTMLElement;
                      if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('.cursor-grab')) return;
                      handleEdit(member);
                    }}
                  >
                    <td className="px-2 py-4 text-center">
                      {onUpdateStaffOrder && (
                        <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                          <GripVertical size={16} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-4 text-sm text-center">{index + 1}</td>
                    <td className="px-3 py-4 sticky left-0 bg-white">
                      <div>
                        <div className="text-sm font-medium">{member.name}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-1">
                          <Calendar size={12} />
                          Joined: {new Date(member.joinedDate).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    {visibleColumns.location !== false && <td className="px-3 py-4 text-center">
                      <span className={getLocationColor(member.location)}>{member.location}</span>
                    </td>}
                    {visibleColumns.floor !== false && <td className="px-3 py-4 text-sm text-center">
                      {member.floor || <span className="text-gray-400 italic">-</span>}
                    </td>}
                    {visibleColumns.designation !== false && <td className="px-3 py-4 text-sm text-center">
                      {member.designation || <span className="text-gray-400 italic">-</span>}
                    </td>}
                    {visibleColumns.experience !== false && <td className="px-3 py-4 text-sm text-blue-600 font-medium text-center">
                      {calculateExperience(member.joinedDate)}
                    </td>}
                    {visibleColumns.basic !== false && <td className="px-3 py-4 text-sm text-center">₹{member.basicSalary.toLocaleString()}</td>}
                    {visibleColumns.incentive !== false && <td className="px-3 py-4 text-sm text-center">₹{member.incentive.toLocaleString()}</td>}
                    {visibleColumns.hra !== false && <td className="px-3 py-4 text-sm text-center">₹{member.hra.toLocaleString()}</td>}
                    {visibleColumns.meal !== false && <td className="px-3 py-4 text-sm text-center">₹{(member.mealAllowance || 0).toLocaleString()}</td>}
                    {activeCustomCategories.map(category => (
                      <td key={category.id} className="px-3 py-4 text-sm text-center">
                        ₹{(member.salarySupplements?.[category.id] || member.salarySupplements?.[category.key] || 0).toLocaleString()}
                      </td>
                    ))}
                    {visibleColumns.total !== false && <td className="px-3 py-4 text-sm font-semibold text-green-600 text-center">₹{calculateMemberTotalSalary(member).toLocaleString()}</td>}
                    {visibleColumns.staffType !== false && <td className="px-3 py-4 text-sm text-center">
                      {member.staffAccommodation ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.staffAccommodation === 'day_scholar' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {member.staffAccommodation === 'day_scholar' ? 'Day Scholar' : 'Accommodation'}
                        </span>
                      ) : <span className="text-gray-400 italic">-</span>}
                    </td>}
                    {visibleColumns.payment !== false && <td className="px-3 py-4 text-sm text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.paymentMode === 'bank' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200'}`}>
                        {member.paymentMode === 'bank' ? 'Bank' : 'Cash'}
                      </span>
                    </td>}
                    {visibleColumns.bankName !== false && <td className="px-3 py-4 text-sm text-center">{member.bankName || <span className="text-gray-400 italic">-</span>}</td>}
                    {visibleColumns.accountNo !== false && <td className="px-3 py-4 text-sm text-center">{member.bankAccountNumber || <span className="text-gray-400 italic">-</span>}</td>}
                    {visibleColumns.ifsc !== false && <td className="px-3 py-4 text-sm text-center">{member.ifscCode || <span className="text-gray-400 italic">-</span>}</td>}
                    {visibleColumns.nextHike !== false && <td className="px-3 py-4 text-sm text-center">{member.nextHikeDate ? new Date(member.nextHikeDate).toLocaleDateString() : <span className="text-gray-400 italic">-</span>}</td>}
                    {visibleColumns.hikeInterval !== false && <td className="px-3 py-4 text-sm text-center">{member.hikeIntervalMonths ? `${member.hikeIntervalMonths}m` : <span className="text-gray-400 italic">Default</span>}</td>}
                    {visibleColumns.salaryHistory !== false && <td className="px-3 py-4 text-center">
                      <button
                        onClick={() => setShowSalaryHistory(member)}
                        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full mx-auto ${hasHikes ? 'badge-premium badge-success' : 'badge-premium badge-neutral'} hover:opacity-80 transition-opacity border-0`}
                      >
                        <TrendingUp size={12} />
                        {hasHikes ? `${memberHikes.length} hikes` : 'No hikes'}
                      </button>
                    </td>}
                    {visibleColumns.contact !== false && <td className="px-3 py-4 text-sm text-center">
                      {member.contactNumber ? (
                        <span>{member.contactNumber}</span>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>}
                    {visibleColumns.address !== false && <td className="px-3 py-4 text-sm text-center">
                      {member.address ? (
                        <button
                          onClick={() => setViewAddressModal({ name: member.name, address: member.address || '' })}
                          className="text-indigo-600 font-medium max-w-[120px] truncate block cursor-pointer hover:text-indigo-800 mx-auto"
                          title="Click to view full address"
                        >
                          📍 {member.address.length > 12 ? member.address.substring(0, 12) + '...' : member.address}
                        </button>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>}
                    {visibleColumns.image !== false && <td className="px-3 py-4 text-center">
                      {member.photo ? (
                        <button onClick={() => setViewImageModal({ name: member.name, photo: member.photo || '' })} className="cursor-pointer mx-auto block">
                          <img src={member.photo} alt={member.name} className="w-10 h-10 rounded-full object-cover border-2 border-indigo-200 hover:border-indigo-400 hover:scale-110 transition-all mx-auto" />
                        </button>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 mx-auto">
                          <Users size={16} />
                        </div>
                      )}
                    </td>}
                    <td className="px-3 py-4 text-sm text-center">
                      <div className="flex space-x-2 justify-center">
                        <button onClick={() => handleEdit(member)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50" title="Edit">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => setFaceModalStaff(member)} className="text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-50" title="Face Samples">
                          <Camera size={16} />
                        </button>
                        <button onClick={() => handleDelete(member)} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50" title="Archive">
                          <Archive size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Location Manager Modal */}
      {showLocationManager && (
        <div className="modal-overlay" onClick={() => setShowLocationManager(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                <MapPin className="text-purple-400" size={18} />
                Manage Locations
              </h3>
              <button onClick={() => setShowLocationManager(false)} className="text-white/50 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="New Location Name"
                className="input-premium flex-1 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter' && newLocation.trim()) handleCreateLocation(); }}
              />
              <button
                onClick={handleCreateLocation}
                disabled={!newLocation.trim()}
                className="btn-premium px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' }}
              >
                Add
              </button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {locations.map(loc => (
                <div key={loc.id} className="flex items-center justify-between p-2.5 glass-card-static rounded-lg">
                  {editingLocation?.id === loc.id ? (
                    <div className="flex-1 flex gap-2 mr-2">
                      <input
                        type="text"
                        value={editLocationValue}
                        onChange={(e) => setEditLocationValue(e.target.value)}
                        className="input-premium flex-1 text-sm py-1"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateLocation(loc.id); if (e.key === 'Escape') setEditingLocation(null); }}
                      />
                      <button onClick={() => handleUpdateLocation(loc.id)} className="p-1 text-emerald-400 hover:text-emerald-300" title="Save"><Check size={16} /></button>
                      <button onClick={() => setEditingLocation(null)} className="p-1 text-red-400 hover:text-red-300" title="Cancel"><X size={16} /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-medium">{loc.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingLocation(loc); setEditLocationValue(loc.name); }}
                          className="p-1.5 text-blue-400 hover:bg-white/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteLocation(loc.id)}
                          className="p-1.5 text-red-400 hover:bg-white/10 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {locations.length === 0 && (
                <p className="text-center text-white/50 py-4">No locations added yet</p>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowLocationManager(false)} className="btn-ghost px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Salary Category Manager Modal */}
      {showCategoryManager && (
        <div className="modal-overlay" onClick={() => setShowCategoryManager(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                <DollarSign className="text-emerald-400" size={18} />
                Manage Salary Categories
              </h3>
              <button onClick={() => setShowCategoryManager(false)} className="text-white/50 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New Category Name"
                className="input-premium flex-1 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter' && newCategory.trim()) handleAddCategory(); }}
              />
              <button
                onClick={handleAddCategory}
                disabled={!newCategory.trim()}
                className="btn-premium btn-premium-success px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {salaryCategories.map(cat => (
                <div key={cat.id} className={`flex items-center justify-between p-2.5 rounded-lg glass-card-static ${cat.isDeleted ? 'opacity-50' : ''}`}>
                  {editingCategory === cat.id ? (
                    <>
                      <input
                        type="text"
                        value={editCategoryValue}
                        onChange={(e) => setEditCategoryValue(e.target.value)}
                        className="input-premium flex-1 text-sm py-1"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCategoryEdit(cat.id); if (e.key === 'Escape') setEditingCategory(null); }}
                      />
                      <div className="flex gap-2 ml-2">
                        <button onClick={() => handleSaveCategoryEdit(cat.id)} className="text-emerald-400 hover:text-emerald-300" title="Save"><Check size={16} /></button>
                        <button onClick={() => setEditingCategory(null)} className="text-white/50 hover:text-white" title="Cancel"><X size={16} /></button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${cat.isDeleted ? 'line-through text-white/40' : ''}`}>{cat.name}</span>
                        {cat.isDeleted && <span className="text-xs text-red-400 italic px-1.5 py-0.5 bg-red-500/20 rounded">Deleted</span>}
                      </div>
                      <div className="flex gap-1 items-center">
                        {!cat.isDeleted && (
                          <button
                            onClick={() => { setEditingCategory(cat.id); setEditCategoryValue(cat.name); }}
                            className="p-1 text-blue-400 hover:bg-white/10 rounded-lg transition-colors"
                            title="Edit name"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {cat.isDeleted ? (
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1 text-emerald-400 hover:bg-white/10 rounded-lg transition-colors"
                            title="Restore"
                          >
                            <RotateCcw size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1 text-red-400 hover:bg-white/10 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-white/40 mt-3">All categories can be soft-deleted and restored. Deleted categories won't appear in forms and tables.</p>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowCategoryManager(false)} className="btn-ghost px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Floor Manager Modal */}
      {showFloorManager && (
        <div className="modal-overlay" onClick={() => setShowFloorManager(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                <Layers className="text-cyan-400" size={18} />
                Manage Floors
              </h3>
              <button onClick={() => setShowFloorManager(false)} className="text-white/50 hover:text-white p-1"><X size={20} /></button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <select
                value={newFloorLocation}
                onChange={(e) => setNewFloorLocation(e.target.value)}
                className="input-premium text-sm sm:w-[45%] sm:flex-shrink-0"
              >
                <option value="">Select Location</option>
                {locations.map(loc => (<option key={loc.id} value={loc.name}>{loc.name}</option>))}
              </select>
              <input
                type="text"
                value={newFloor}
                onChange={(e) => setNewFloor(e.target.value)}
                placeholder="Floor Name"
                className="input-premium flex-1 min-w-0 text-sm sm:min-w-[120px]"
                onKeyDown={(e) => { if (e.key === 'Enter' && newFloor.trim() && newFloorLocation) handleAddFloor(); }}
              />
              <button
                onClick={handleAddFloor}
                disabled={!newFloor.trim() || !newFloorLocation}
                className="btn-premium px-4 py-2 text-sm disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' }}
              >
                Add
              </button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {locations.map(loc => {
                const locFloors = floors.filter(f => f.locationName === loc.name);
                if (locFloors.length === 0) return null;
                return (
                  <div key={loc.id}>
                    <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-1">{loc.name}</h4>
                    {locFloors.map(floor => (
                      <div key={floor.id} className="flex items-center justify-between p-2.5 glass-card-static rounded-lg mb-1">
                        {editingFloor?.id === floor.id ? (
                          <div className="flex-1 flex gap-2 mr-2">
                            <input type="text" value={editFloorValue} onChange={(e) => setEditFloorValue(e.target.value)} className="input-premium flex-1 text-sm py-1" autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateFloor(floor.id); if (e.key === 'Escape') setEditingFloor(null); }} />
                            <button onClick={() => handleUpdateFloor(floor.id)} className="p-1 text-emerald-400"><Check size={16} /></button>
                            <button onClick={() => setEditingFloor(null)} className="p-1 text-red-400"><X size={16} /></button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm font-medium">{floor.name}</span>
                            <div className="flex gap-1">
                              <button onClick={() => { setEditingFloor(floor); setEditFloorValue(floor.name); }} className="p-1 text-blue-400 hover:bg-white/10 rounded-lg"><Edit2 size={14} /></button>
                              <button onClick={() => handleDeleteFloor(floor)} className="p-1 text-red-400 hover:bg-white/10 rounded-lg"><Trash2 size={14} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
              {floors.length === 0 && <p className="text-center text-white/50 py-4">No floors added yet</p>}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowFloorManager(false)} className="btn-ghost px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Designation Manager Modal */}
      {showDesignationManager && (
        <div className="modal-overlay" onClick={() => setShowDesignationManager(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                <Briefcase className="text-amber-400" size={18} />
                Manage Designations
              </h3>
              <button onClick={() => setShowDesignationManager(false)} className="text-white/50 hover:text-white p-1"><X size={20} /></button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <input
                type="text"
                value={newDesignation}
                onChange={(e) => setNewDesignation(e.target.value)}
                placeholder="New Designation"
                className="input-premium flex-1 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter' && newDesignation.trim()) handleAddDesignation(); }}
              />
              <button
                onClick={handleAddDesignation}
                disabled={!newDesignation.trim()}
                className="btn-premium px-4 py-2 text-sm disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}
              >
                Add
              </button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {designations.map(desig => (
                <div key={desig.id} className="flex items-center justify-between p-2.5 glass-card-static rounded-lg">
                  {editingDesignation?.id === desig.id ? (
                    <div className="flex-1 flex gap-2 mr-2">
                      <input type="text" value={editDesignationValue} onChange={(e) => setEditDesignationValue(e.target.value)} className="input-premium flex-1 text-sm py-1" autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateDesignation(desig.id); if (e.key === 'Escape') setEditingDesignation(null); }} />
                      <button onClick={() => handleUpdateDesignation(desig.id)} className="p-1 text-emerald-400"><Check size={16} /></button>
                      <button onClick={() => setEditingDesignation(null)} className="p-1 text-red-400"><X size={16} /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-medium">{desig.displayName}</span>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingDesignation(desig); setEditDesignationValue(desig.displayName); }} className="p-1 text-blue-400 hover:bg-white/10 rounded-lg"><Edit2 size={14} /></button>
                        <button onClick={() => handleDeleteDesignation(desig)} className="p-1 text-red-400 hover:bg-white/10 rounded-lg"><Trash2 size={14} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {designations.length === 0 && <p className="text-center text-white/50 py-4">No designations added yet</p>}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowDesignationManager(false)} className="btn-ghost px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="modal-content max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className={`w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center ${confirmDialog.action === 'restore' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                {confirmDialog.action === 'restore' ? (
                  <RotateCcw className="text-emerald-400" size={28} />
                ) : (
                  <Trash2 className="text-red-400" size={28} />
                )}
              </div>
              <h3 className="text-lg font-bold text-white">
                {confirmDialog.action === 'restore' ? 'Restore' : 'Delete'} {confirmDialog.type === 'location' ? 'Location' : confirmDialog.type === 'floor' ? 'Floor' : confirmDialog.type === 'designation' ? 'Designation' : 'Category'}?
              </h3>
            </div>
            <p className="text-white/60 text-sm text-center mb-6">
              {confirmDialog.action === 'restore' ? (
                <>Are you sure you want to restore <strong className="text-white">{confirmDialog.name}</strong>?</>
              ) : (
                <>
                  Are you sure you want to delete <strong className="text-white">{confirmDialog.name}</strong>?
                  {confirmDialog.type === 'location' && <span className="block mt-1 text-xs text-amber-400">This will also deactivate the associated manager account.</span>}
                  <span className="block mt-1 text-xs text-white/40">This is a soft delete — old data will be preserved.</span>
                </>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (confirmDialog.type === 'location') confirmLocationDelete();
                  else if (confirmDialog.type === 'floor') confirmFloorDelete();
                  else if (confirmDialog.type === 'designation') confirmDesignationDelete();
                  else confirmCategoryAction();
                }}
                className={`flex-1 ${confirmDialog.action === 'restore' ? 'btn-premium btn-premium-success' : 'btn-premium btn-premium-danger'}`}
              >
                {confirmDialog.action === 'restore' ? 'Restore' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDialog(null)} className="flex-1 btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Full Address View Modal */}
      {viewAddressModal && (
        <div className="modal-overlay" onClick={() => setViewAddressModal(null)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <MapPin className="text-indigo-400" size={20} />
                Address - {viewAddressModal.name}
              </h3>
              <button onClick={() => setViewAddressModal(null)} className="text-white/50 hover:text-white p-1"><X size={20} /></button>
            </div>
            <div className="glass-card-static rounded-lg p-4">
              <p className="text-base leading-relaxed">{viewAddressModal.address}</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setViewAddressModal(null)} className="btn-premium px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Full Image View Modal */}
      {viewImageModal && (
        <div className="modal-overlay" onClick={() => setViewImageModal(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewImageModal(null)} className="absolute -top-3 -right-3 bg-white/20 text-white hover:bg-white/30 p-2 rounded-full shadow-lg z-10">
              <X size={20} />
            </button>
            <div className="glass-card-static p-2 rounded-xl">
              <img src={viewImageModal.photo} alt={viewImageModal.name} className="max-w-[85vw] max-h-[80vh] rounded-lg object-contain" />
              <p className="text-center font-medium mt-2 pb-1">{viewImageModal.name}</p>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {credentialsModal && (
        <div className="modal-overlay" onClick={() => setCredentialsModal(null)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center">
                <Check className="text-white" size={32} />
              </div>
              <h3 className="text-xl font-bold text-white">Manager Account Created</h3>
              <p className="text-white/60 text-sm mt-1">for {credentialsModal.locationName}</p>
            </div>
            <div className="space-y-4 mb-6">
              <div className="glass-card-static p-4 rounded-xl">
                <label className="block text-xs font-medium text-white/50 mb-1">Email</label>
                <div className="flex items-center justify-between">
                  <span className="text-white font-mono">{credentialsModal.credentials.email}</span>
                  <button
                    onClick={() => copyToClipboard(credentialsModal.credentials.email, 'email')}
                    className={`p-2 rounded-lg transition-colors ${copiedField === 'email' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                  >
                    {copiedField === 'email' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <div className="glass-card-static p-4 rounded-xl">
                <label className="block text-xs font-medium text-white/50 mb-1">Password</label>
                <div className="flex items-center justify-between">
                  <span className="text-white font-mono">{credentialsModal.credentials.password}</span>
                  <button
                    onClick={() => copyToClipboard(credentialsModal.credentials.password, 'password')}
                    className={`p-2 rounded-lg transition-colors ${copiedField === 'password' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                  >
                    {copiedField === 'password' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-6">
              <AlertCircle className="text-amber-400 flex-shrink-0" size={18} />
              <p className="text-amber-400 text-sm">Save these credentials securely. You can change them in Settings.</p>
            </div>
            <button onClick={() => setCredentialsModal(null)} className="w-full btn-premium">Done</button>
          </div>
        </div>
      )}

      {showBulkImport && (
        <BulkStaffUpload
          existingStaff={staff}
          onImport={async (records) => {
            for (const r of records) {
              await onAddStaff(r);
            }
            if (onRefreshStaff) await onRefreshStaff();
          }}
          onClose={() => setShowBulkImport(false)}
        />
      )}

      {faceModalStaff && (
        <div className="modal-overlay" onClick={() => setFaceModalStaff(null)}>
          <div className="modal-content max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                <Camera size={18} className="text-indigo-500" />
                Face Samples — {faceModalStaff.name}
              </h3>
              <button onClick={() => setFaceModalStaff(null)} className="p-2 rounded-lg hover:bg-white/10 text-[var(--text-secondary)]">
                <X size={18} />
              </button>
            </div>
            <FaceRegistration staff={faceModalStaff} isAdmin capturedBy="admin" />
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
