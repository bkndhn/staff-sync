import React, { useState, useRef, useEffect } from 'react';
import { Staff, PayrollHike } from '../types';
import { Users, Plus, Edit2, Trash2, Archive, Calendar, TrendingUp, MapPin, DollarSign, Check, X, GripVertical, Filter, Copy, AlertCircle, RotateCcw, Layers, Briefcase, Upload, Shield, Camera, ShieldOff, Settings2, ChevronDown } from 'lucide-react';
import { calculateExperience } from '../utils/salaryCalculations';
import { STATUTORY_DEFINITIONS, defaultConfigFor } from '../utils/statutoryDeductions';
import type { StatutoryDeduction, DeductionBase } from '../types';
import SalaryHikeHistory, { PayrollHikeHistory } from './SalaryHikeHistory';
import SalaryHikeDueModal, { PayrollHikeDueModal } from './SalaryHikeDueModal';
import BulkStaffUpload from './BulkStaffUpload';
import FaceRegistration from './FaceRegistration';
import { settingsService } from '../services/settingsService';
import { locationService, type Branch } from '../services/locationService';
import { salaryCategoryService, type PayrollCategory } from '../services/salaryCategoryService';
import { floorService, type Zone } from '../services/floorService';
import { designationService, type Designation } from '../services/designationService';
import { customAlert, customConfirm } from './CustomDialog';
import { canSeeEmployeeCode, hideStatutoryExtras, type AppRole } from '../lib/roleVisibility';
import { userService } from '../services/userService';
import { customFieldsService } from '../services/customFieldsService';
import { CustomFieldDefinition } from '../types';
import { StaffProfileDrawer } from './StaffProfileDrawer';
import { StaffBulkActionBar } from './StaffBulkActionBar';
import { CustomFieldsManagerModal } from './CustomFieldsManagerModal';
import { Sliders } from 'lucide-react';

import { userPreferencesService } from '../services/userPreferencesService';

interface StaffManagementProps {
  staff: Staff[];
  salaryHikes: PayrollHike[];
  onAddStaff: (staff: Omit<Staff, 'id'>) => void;
  onUpdateStaff: (id: string, staff: Partial<Staff>) => void;
  onDeleteStaff: (id: string, reason: string) => void;
  onUpdateStaffOrder?: (newOrder: Staff[]) => void;
  onRefreshStaff?: () => Promise<void>;
  userRole?: AppRole;
}

const StaffManagement: React.FC<StaffManagementProps> = ({
  staff,
  salaryHikes,
  onAddStaff,
  onUpdateStaff,
  onDeleteStaff,
  onUpdateStaffOrder,
  onRefreshStaff,
  userRole
}) => {
  const showEmpCode = canSeeEmployeeCode(userRole);
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
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    employeeCode: true,
    location: true, floor: true, designation: true, experience: true,
    basic: true, incentive: true, hra: true, meal: true, total: true,
    staffType: true, payment: true, bankName: false, accountNo: false,
    ifsc: false, nextHike: false, hikeInterval: false, salaryHistory: true,
    contact: true, address: true, image: true
  });

  useEffect(() => {
    userPreferencesService.getPreference<Record<string, boolean> | null>('staffVisibleColumns', null).then(saved => {
      if (saved) setVisibleColumns(saved);
    });
  }, []);

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => {
      const updated = { ...prev, [col]: !prev[col] };
      userPreferencesService.setPreference('staffVisibleColumns', updated);
      return updated;
    });
  };

  const columnLabels: Record<string, string> = {
    employeeCode: 'Emp Code',
    location: 'Branch', floor: 'Zone', designation: 'Designation', experience: 'Experience',
    basic: 'Basic', incentive: 'Incentive', hra: 'HRA', meal: 'Meal Allowance', total: 'Total',
    staffType: 'Staff Type', payment: 'Payment', bankName: 'Bank Name', accountNo: 'Account No',
    ifsc: 'IFSC', nextHike: 'Next Hike', hikeInterval: 'Hike Interval', salaryHistory: 'Payroll History',
    contact: 'Contact', address: 'Address', image: 'Image'
  };
  const [draggedItem, setDraggedItem] = useState<Staff | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Settings State
  const [showLocationManager, setShowLocationManager] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showFloorManager, setShowFloorManager] = useState(false);
  const [showDesignationManager, setShowDesignationManager] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(() => customFieldsService.getCustomFieldsSync());
  const [showCustomFieldsModal, setShowCustomFieldsModal] = useState(false);
  const [drawerStaff, setDrawerStaff] = useState<Staff | null>(null);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [showWebcamModal, setShowWebcamModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
      setMediaStream(stream);
      setShowWebcamModal(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Camera access error:', err);
      await customAlert('Unable to access webcam. Please ensure your camera is connected and browser permissions are granted.');
    }
  };

  const stopWebcam = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    setShowWebcamModal(false);
  };

  const snapWebcamPhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const maxDim = 300;
      let width = video.videoWidth || 640;
      let height = video.videoHeight || 480;
      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setFormData(prev => ({ ...prev, photo: dataUrl }));
      }
    }
    stopWebcam();
  };
  const [locations, setLocations] = useState<Branch[]>([]);
  const [salaryCategories, setSalaryCategories] = useState<PayrollCategory[]>(() => salaryCategoryService.getCategoriesSync());
  const [floors, setFloors] = useState<Zone[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newFloor, setNewFloor] = useState('');
  const [newFloorLocation, setNewFloorLocation] = useState('');
  const newFloorBranch = newFloorLocation;
  const setNewFloorBranch = setNewFloorLocation;
  const [editingFloor, setEditingFloor] = useState<Zone | null>(null);
  const [editFloorValue, setEditFloorValue] = useState('');
  const [applyToAllLocations, setApplyToAllLocations] = useState(false);
  const [applyDeleteToAllLocations, setApplyDeleteToAllLocations] = useState(false);
  const [newDesignation, setNewDesignation] = useState('');
  const [editingLocation, setEditingLocation] = useState<Branch | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingDesignation, setEditingDesignation] = useState<Designation | null>(null);
  const [editLocationValue, setEditLocationValue] = useState('');
  const [editLocationIp, setEditLocationIp] = useState('');
  const [editLocationPort, setEditLocationPort] = useState(4370);
  const [editLocationLat, setEditLocationLat] = useState<number | ''>('');
  const [editLocationLng, setEditLocationLng] = useState<number | ''>('');
  const [editLocationRadius, setEditLocationRadius] = useState<number | ''>('');
  const [editCategoryValue, setEditCategoryValue] = useState('');
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

  // Fetch locations, categories, and custom fields on mount
  React.useEffect(() => {
    const fetchData = async () => {
      const { locationService } = await import('../services/locationService');
      const [locs, cats, flrs, desigs, cFields] = await Promise.all([
        locationService.getLocations(),
        salaryCategoryService.getCategories(),
        floorService.getFloors(),
        designationService.getDesignations(),
        customFieldsService.getCustomFields(),
      ]);
      setLocations(locs);
      setSalaryCategories(cats);
      setFloors(flrs);
      setDesignations(desigs);
      setCustomFields(cFields);
    };
    fetchData();
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    employeeCode: '',
    location: '',
    floor: '',
    designation: '',
    basicPayroll: 15000,
    incentive: 10000,
    hra: 0,
    mealAllowance: 0,
    mealAllowanceThreshold: 0,
    staffAccommodation: '' as '' | 'day_scholar' | 'accommodation',
    joinedDate: new Date().toISOString().split('T')[0],
    salarySupplements: {} as Record<string, number>,
    allowanceCalcModes: {} as Record<string, 'fixed' | 'per_day'>,
    sundayPenalty: true,
    exemptFromLateDeduction: false,
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
    esiNumber: '',
    deviceId: '',
    isStatutory: false,
    email: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    dob: '',
    gender: '' as 'male' | 'female' | 'other' | '',
    upiId: '',
    aadhaarNumber: '',
    panNumber: '',
    customFields: {} as Record<string, any>
  });

  // Set default location when locations load
  React.useEffect(() => {
    if (locations.length > 0 && !formData.location) {
      setFormData(prev => ({ ...prev, location: locations[0]?.name }));
    }
  }, [locations]);

  // Handle photo upload with auto-resizing canvas compression (max 300x300 JPEG)
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 300;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.85);
            setFormData(prev => ({ ...prev, photo: compressed }));
          } else {
            setFormData(prev => ({ ...prev, photo: rawUrl }));
          }
        };
        img.onerror = () => {
          setFormData(prev => ({ ...prev, photo: rawUrl }));
        };
        img.src = rawUrl;
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
      String(member.basicPayroll ?? ''), String(member.incentive ?? ''),
      String(member.hra ?? ''), String(member.mealAllowance ?? ''), String(member.totalPayroll ?? ''),
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

  const handleCreateBranch = async () => {
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
      } else {
        await customAlert("Failed to create location. It may already exist or there is a database permission error.");
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

  const handleUpdateBranch = async (id: string) => {
    if (!editLocationValue.trim()) return;
    const loc = editingLocation;
    if (!loc) return;
    const { locationService } = await import('../services/locationService');

    if (editLocationValue !== loc.name) {
        const updated = await locationService.updateLocation(id, editLocationValue);
        if (updated) {
          setLocations(locations.map(l => l.id === id ? { ...l, name: updated.name } : l));
          setFloors(floors.map(f => f.locationName === loc.name ? { ...f, locationName: updated.name } : f));
          onRefreshStaff?.();
        } else {
          await customAlert("Failed to update location. Please try again.");
        }
    }
    // Update config
    const port = editLocationPort || 4370;
    const config = {
        device_ip: editLocationIp,
        device_port: port,
        latitude: editLocationLat === '' ? undefined : Number(editLocationLat),
        longitude: editLocationLng === '' ? undefined : Number(editLocationLng),
        radius_meters: editLocationRadius === '' ? undefined : Number(editLocationRadius)
    };
    await locationService.updateLocationConfig(id, config);
    setLocations(prev => prev.map(l => l.id === id ? { 
        ...l, 
        device_ip: editLocationIp, 
        device_port: port,
        latitude: config.latitude,
        longitude: config.longitude,
        radius_meters: config.radius_meters
    } : l));
    
    setEditingLocation(null);
    setEditLocationValue('');
  };

  const handleDeleteBranch = async (id: string) => {
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

  const handleDeleteCategory = (cat: PayrollCategory) => {
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

  // Zone handlers
  const handleAddZone = async () => {
    if (!newFloor.trim() || !newFloorLocation) return;
    
    if (newFloorBranch === 'ALL') {
      const { floorService } = await import('../services/floorService');
      const addedFloors: Zone[] = [];
      for (const loc of locations) {
        // Only add if it doesn't already exist for this location
        if (!floors.find(f => f.locationName === loc.name && f.name.toLowerCase() === newFloor.trim().toLowerCase())) {
          const floor = await floorService.addFloor(loc.name, newFloor.trim());
          if (floor) addedFloors.push(floor);
        }
      }
      if (addedFloors.length > 0) {
        setFloors(prev => [...prev, ...addedFloors]);
      }
      setNewFloor('');
    } else {
      const { floorService } = await import('../services/floorService');
      const floor = await floorService.addFloor(newFloorLocation, newFloor.trim());
      if (floor) {
        setFloors(prev => [...prev, floor]);
        setNewFloor('');
      }
    }
  };

  const handleUpdateZone = async (id: string) => {
    if (!editFloorValue.trim()) return;
    const floor = editingFloor;
    if (!floor) return;
    if (editFloorValue.trim() !== floor.name) {
      const { floorService } = await import('../services/floorService');
      
      if (applyToAllLocations) {
        // Find all floors with the old name across all locations
        const floorsToUpdate = floors.filter(f => f.name === floor.name);
        const updatedFloors: Zone[] = [];
        for (const f of floorsToUpdate) {
          const updated = await floorService.updateFloor(f.id, editFloorValue.trim());
          if (updated) updatedFloors.push(updated);
        }
        
        if (updatedFloors.length > 0) {
          setFloors(prev => prev.map(f => {
            const up = updatedFloors.find(uf => uf.id === f.id);
            return up ? up : f;
          }));
          onRefreshStaff?.();
        } else {
          await customAlert("Failed to update floors.");
        }
      } else {
        const updated = await floorService.updateFloor(id, editFloorValue.trim());
        if (updated) {
          setFloors(floors.map(f => f.id === id ? updated : f));
          onRefreshStaff?.();
        } else {
          await customAlert("Failed to update floor. It might already exist or you lack permission.");
        }
      }
    }
    setEditingFloor(null);
    setApplyToAllLocations(false);
  };

  const handleDeleteZone = (floor: Zone) => {
    setApplyDeleteToAllLocations(false);
    setConfirmDialog({ type: 'floor', id: floor.id, name: floor.name, action: 'delete' });
  };

  const confirmFloorDelete = async () => {
    if (confirmDialog?.type !== 'floor') return;
    const { floorService } = await import('../services/floorService');
    
    if (applyDeleteToAllLocations) {
      const floorsToDelete = floors.filter(f => f.name === confirmDialog.name);
      for (const f of floorsToDelete) {
        await floorService.deleteFloor(f.id);
      }
    } else {
      await floorService.deleteFloor(confirmDialog.id);
    }
    
    const f = await floorService.getFloors();
    setFloors(f);
    setConfirmDialog(null);
    setApplyDeleteToAllLocations(false);
  };

  const handleCreateLocation = handleCreateBranch;
  const handleUpdateLocation = handleUpdateBranch;
  const handleDeleteLocation = handleDeleteBranch;
  const handleAddFloor = handleAddZone;
  const handleUpdateFloor = handleUpdateZone;
  const handleDeleteFloor = handleDeleteZone;

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
    const desig = editingDesignation;
    if (!desig) return;
    if (editDesignationValue.trim() !== desig.displayName) {
      const { designationService } = await import('../services/designationService');
      const updated = await designationService.updateDesignation(id, editDesignationValue.trim());
      if (updated) {
        setDesignations(designations.map(d => d.id === id ? updated : d));
        onRefreshStaff?.();
      } else {
        await customAlert("Failed to update designation. It might already exist or you lack permission.");
      }
    }
    setEditingDesignation(null);
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

  const calculateMemberTotalPayroll = (member: Staff) => {
    let total = (member.basicPayroll ?? member.basicSalary ?? 0) + (member.incentive ?? 0) + (member.hra ?? 0) + (member.mealAllowance || 0);
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

  const getNextEmployeeCode = (existingStaff: Staff[]): string => {
    const numericCodes = existingStaff
      .map(s => {
        const code = s.employeeCode || (s.deviceId?.startsWith('dev_') ? '' : s.deviceId) || '';
        const num = parseInt(code, 10);
        return !isNaN(num) && num > 0 ? num : 0;
      })
      .filter(n => n > 0);
    const maxCode = numericCodes.length > 0 ? Math.max(...numericCodes) : 0;
    return String(maxCode + 1);
  };

  const resetForm = () => {
    const nextCode = getNextEmployeeCode(staff);
    setFormData({
      name: '',
      employeeCode: nextCode,
      location: locations[0]?.name || 'Big Shop',
      floor: '',
      designation: '',
      basicPayroll: 15000,
      incentive: 10000,
      hra: 0,
      mealAllowance: 0,
      mealAllowanceThreshold: 0,
      staffAccommodation: '',
      joinedDate: new Date().toISOString().split('T')[0],
      salarySupplements: {},
      allowanceCalcModes: {},
      sundayPenalty: true,
      exemptFromLateDeduction: false,
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
      esiNumber: '',
      deviceId: nextCode,
      isStatutory: false,
      email: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      dob: '',
      gender: '',
      upiId: '',
      aadhaarNumber: '',
      panNumber: '',
      customFields: {}
    });
  };

  const activeCustomCategories = salaryCategories.filter(c => !['basic', 'incentive', 'hra', 'meal_allowance'].includes(c.id) && !c.isDeleted);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneDigits = formData.contactNumber.replace(/[^0-9]/g, '');
    if (phoneDigits.length !== 10) {
      await customAlert('Please enter a valid 10-digit mobile number');
      return;
    }
    const deviceIdTrim = (formData.deviceId || formData.employeeCode || '').trim();
    if (!deviceIdTrim) {
      await customAlert('Biometric Device ID / Employee Code is required');
      return;
    }
    const duplicateDevice = staff.find(s => 
      s.id !== editingStaff?.id && 
      ((s.deviceId || '').trim() === deviceIdTrim || (s.employeeCode || '').trim() === deviceIdTrim)
    );
    if (duplicateDevice) {
      await customAlert(`Employee Code / Device ID "${deviceIdTrim}" is already assigned to ${duplicateDevice.name}`);
      return;
    }

    let totalPayroll = (formData.basicPayroll || 0) + (formData.incentive || 0) + (formData.hra || 0) + (formData.mealAllowance || 0);
    totalPayroll += activeCustomCategories.reduce((sum, cat) => sum + (formData.salarySupplements[cat.id] || formData.salarySupplements[cat.key] || 0), 0);

    const experience = calculateExperience(formData.joinedDate);

    if (editingStaff) {
      onUpdateStaff(editingStaff.id, {
        ...formData,
        totalPayroll,
        totalSalary: totalPayroll,
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
        statutoryDeductions: formData.isStatutory ? formData.statutoryDeductions : {},
        pfNumber: formData.isStatutory ? (formData.pfNumber || undefined) : undefined,
        esiNumber: formData.isStatutory ? (formData.esiNumber || undefined) : undefined,
        isStatutory: !!formData.isStatutory
      });
      setEditingStaff(null);
    } else {
      onAddStaff({
        ...formData,
        totalPayroll,
        totalSalary: totalPayroll,
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

    const existingCode = member.employeeCode || (member.deviceId?.startsWith('dev_') ? '' : member.deviceId) || '';
    const supplements = member.salarySupplements || {};
    setFormData({
      name: member.name,
      employeeCode: existingCode,
      location: member.location,
      floor: member.floor || '',
      designation: member.designation || '',
      basicPayroll: member.basicPayroll ?? member.basicSalary ?? 0,
      incentive: member.incentive,
      hra: member.hra,
      mealAllowance: member.mealAllowance || 0,
      mealAllowanceThreshold: member.mealAllowanceThreshold || 0,
      staffAccommodation: member.staffAccommodation || '',
      joinedDate: member.joinedDate,
      salarySupplements: supplements,
      allowanceCalcModes: member.allowanceCalcModes || {},
      sundayPenalty: member.sundayPenalty ?? true,
      exemptFromLateDeduction: member.exemptFromLateDeduction ?? false,
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
      esiNumber: member.esiNumber || '',
      deviceId: existingCode,
      isStatutory: !!member.isStatutory,
      email: member.email || '',
      emergencyContactName: member.emergencyContactName || '',
      emergencyContactPhone: member.emergencyContactPhone || '',
      dob: member.dob || '',
      gender: member.gender || '',
      upiId: member.upiId || '',
      aadhaarNumber: member.aadhaarNumber || '',
      panNumber: member.panNumber || '',
      customFields: member.customFields || {}
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

  const handleResetDevice = async (staffId: string, staffName: string) => {
    if (!await customConfirm(`Are you sure you want to reset the device lock for ${staffName}? They will be able to log in from a new device.`)) return;
    try {
      await onUpdateStaff(staffId, { deviceId: null });
      await onRefreshStaff?.();
      await customAlert(`Device lock reset successfully for ${staffName}. They can now register or log in from a new device.`);
    } catch (error) {
      console.error("Error resetting device:", error);
      await customAlert("Failed to reset device lock.");
    }
  };

  const handleResetStaffPassword = async (staffId: string, staffName: string) => {
    if (!await customConfirm(`Reset login password for ${staffName}? They will need to log in with their joined date (DDMMYYYY) and set a new password.`)) return;
    try {
      const sessionToken = await userService.getSessionToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-reset-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
          },
          body: JSON.stringify({ staffId }),
        },
      );
      if (!res.ok) {
        await customAlert('Failed to reset password. Check your admin session and try again.');
        return;
      }
      await customAlert(`Password reset for ${staffName}. They can now log in with their joined date (DDMMYYYY).`);
    } catch (error) {
      console.error('Error resetting staff password:', error);
      await customAlert('Failed to reset password.');
    }
  };

  const toggleSelectStaff = (id: string) => {
    setSelectedStaffIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedStaffIds.length === activeStaff.length && activeStaff.length > 0) {
      setSelectedStaffIds([]);
    } else {
      setSelectedStaffIds(activeStaff.map(s => s.id));
    }
  };

  const handleBatchUpdateBranch = async (branchName: string) => {
    const count = selectedStaffIds.length;
    for (const id of selectedStaffIds) {
      await onUpdateStaff(id, { location: branchName });
    }
    await onRefreshStaff?.();
    setSelectedStaffIds([]);
    await customAlert(`Successfully updated branch to "${branchName}" for ${count} staff member(s).`);
  };

  const handleBatchUpdateDesignation = async (desigName: string) => {
    const count = selectedStaffIds.length;
    for (const id of selectedStaffIds) {
      await onUpdateStaff(id, { designation: desigName });
    }
    await onRefreshStaff?.();
    setSelectedStaffIds([]);
    await customAlert(`Successfully updated designation to "${desigName}" for ${count} staff member(s).`);
  };

  const handleBatchDelete = async (reason: string) => {
    const count = selectedStaffIds.length;
    for (const id of selectedStaffIds) {
      await onDeleteStaff(id, reason);
    }
    await onRefreshStaff?.();
    setSelectedStaffIds([]);
    await customAlert(`Successfully archived ${count} staff member(s).`);
  };

  const handleExportSelected = () => {
    const selectedList = activeStaff.filter(s => selectedStaffIds.includes(s.id));
    exportStaffCSV(selectedList);
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
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="hidden lg:flex gap-2">
              <button onClick={() => setShowLocationManager(true)} className="btn-premium flex items-center gap-2 px-3 py-2 text-sm" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' }} title="Manage Branchs">
                <MapPin size={16} /><span className="hidden xl:inline">Branches</span>
              </button>
              <button onClick={() => setShowFloorManager(true)} className="btn-premium flex items-center gap-2 px-3 py-2 text-sm" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)' }} title="Manage Zones">
                <Layers size={16} /><span className="hidden xl:inline">Zones</span>
              </button>
              <button onClick={() => setShowDesignationManager(true)} className="btn-premium flex items-center gap-2 px-3 py-2 text-sm" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }} title="Manage Designations">
                <Briefcase size={16} /><span className="hidden xl:inline">Designations</span>
              </button>
              <button onClick={() => setShowCategoryManager(true)} className="btn-premium btn-premium-success flex items-center gap-2 px-3 py-2 text-sm" title="Manage Payroll Categories">
                <DollarSign size={16} /><span className="hidden xl:inline">Categories</span>
              </button>
              <button onClick={() => setShowCustomFieldsModal(true)} className="btn-premium flex items-center gap-2 px-3 py-2 text-sm" style={{ background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' }} title="Manage Custom Fields">
                <Sliders size={16} /><span className="hidden xl:inline">Custom Fields</span>
              </button>
            </div>

            {/* Mobile Dropdown for Secondary Actions */}
            <div className="lg:hidden relative flex-1 sm:flex-none">
              <button onClick={() => {
                  const el = document.getElementById('mobile-more-actions');
                  if (el) el.classList.toggle('hidden');
                }} 
                className="w-full btn-premium flex justify-center items-center gap-2 px-3 py-2 text-sm bg-white/10"
              >
                <Settings2 size={16} /> <span>Manage</span> <ChevronDown size={14} />
              </button>
              <div id="mobile-more-actions" className="hidden absolute top-full left-0 mt-2 w-48 bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-xl shadow-2xl z-50 overflow-hidden">
                <button onClick={() => { setShowLocationManager(true); document.getElementById('mobile-more-actions')?.classList.add('hidden'); }} className="w-full text-left px-4 py-3 hover:bg-[var(--glass-bg-strong)] text-[var(--text-primary)] text-sm flex items-center gap-3 border-b border-[var(--glass-border)]"><MapPin size={16} className="text-purple-400"/>Branches</button>
                <button onClick={() => { setShowFloorManager(true); document.getElementById('mobile-more-actions')?.classList.add('hidden'); }} className="w-full text-left px-4 py-3 hover:bg-[var(--glass-bg-strong)] text-[var(--text-primary)] text-sm flex items-center gap-3 border-b border-[var(--glass-border)]"><Layers size={16} className="text-blue-400"/>Zones</button>
                <button onClick={() => { setShowDesignationManager(true); document.getElementById('mobile-more-actions')?.classList.add('hidden'); }} className="w-full text-left px-4 py-3 hover:bg-[var(--glass-bg-strong)] text-[var(--text-primary)] text-sm flex items-center gap-3 border-b border-[var(--glass-border)]"><Briefcase size={16} className="text-amber-400"/> Designations</button>
                <button onClick={() => { setShowCategoryManager(true); document.getElementById('mobile-more-actions')?.classList.add('hidden'); }} className="w-full text-left px-4 py-3 hover:bg-[var(--glass-bg-strong)] text-[var(--text-primary)] text-sm flex items-center gap-3"><DollarSign size={16} className="text-emerald-400"/> Categories</button>
              </div>
            </div>

            <button onClick={() => setShowBulkImport(true)} className="btn-premium btn-premium-success flex items-center justify-center gap-2 px-3 py-2 text-sm flex-1 sm:flex-none" title="Bulk Import">
              <Upload size={16} /><span className="hidden sm:inline">Import</span>
            </button>
            <button onClick={() => { resetForm(); setEditingStaff(null); setShowAddForm(!showAddForm); }} className="btn-premium flex items-center justify-center gap-2 px-4 py-2 flex-1 sm:flex-none whitespace-nowrap">
              <Plus size={20} /><span className="hidden sm:inline">Add Staff</span>
            </button>
          </div>
        </div>
      </div>

      {/* Payroll Hike Due Banner */}
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
                <TrendingUp className="text-amber-600 dark:text-amber-400" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-amber-700 dark:text-amber-400">Payroll Hike Due</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  {staffDueForHike.length} staff member{staffDueForHike.length !== 1 ? 's are' : ' is'} eligible for a salary hike
                </p>
              </div>
            </div>
            <span className="text-amber-700 dark:text-amber-400 text-sm font-medium">Click to view →</span>
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

      {/* Filter Bar Wrapped */}
      <div className="glass-card-static rounded-xl overflow-hidden mb-6">
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2 text-white/90">
            <Filter size={18} />
            <span className="font-semibold tracking-wide">Filter Options</span>
          </div>
          <div className="text-white/60">
            {showFilters ? <span className="text-sm">Hide Filters</span> : <span className="text-sm">Show Filters</span>}
          </div>
        </button>
        
        {showFilters && (
          <div className="p-4 space-y-4 border-t border-white/5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-white/60 w-32">
                <span className="font-medium text-sm">Branch:</span>
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
          <div className="flex items-center gap-2 text-white/60 w-32">
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
          <div className="flex items-center gap-2 text-white/60 w-32">
            <span className="font-medium text-sm">Zone:</span>
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
            {Array.from(new Set([
              ...floors.filter(f => f.isActive !== false && (locationFilter === 'All' || f.locationName === locationFilter)).map(f => f.name),
              ...staff.filter(s => s.isActive !== false && s.floor && (locationFilter === 'All' || s.location === locationFilter)).map(s => s.floor!)
            ])).sort().map(flrName => (
              <button
                key={flrName}
                onClick={() => setFloorFilter(flrName)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${floorFilter === flrName
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
              >
                {flrName}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-white/60 w-32">
            <span className="font-medium text-sm">Designation:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setDesignationFilter('All')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${designationFilter === 'All'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
            >
              All
            </button>
            {Array.from(new Set([
              ...designations.filter(d => d.isActive !== false).map(d => d.displayName),
              ...staff.filter(s => s.isActive !== false && s.designation).map(s => s.designation!)
            ])).sort().map(desigName => (
              <button
                key={desigName}
                onClick={() => setDesignationFilter(desigName)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${designationFilter === desigName
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
              >
                {desigName}
              </button>
            ))}
          </div>
        </div>
        </div>
        )}
      </div>

      {/* Add/Edit Staff Form */}
      {showAddForm && (
        <div className="modal-overlay" onClick={() => { resetForm(); setEditingStaff(null); setShowAddForm(false); }}>
          <div ref={formRef} className="modal-content !max-w-4xl w-full max-h-[92vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { resetForm(); setEditingStaff(null); setShowAddForm(false); }}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-white flex items-center justify-center shadow-lg backdrop-blur"
            >
              <X size={18} />
            </button>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 pr-10">
              {editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
            </h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Name</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-premium" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Branch</label>
              <select value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="input-premium">
                {locations.map(loc => (<option key={loc.id} value={loc.name}>{loc.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Zone</label>
              <select value={formData.floor} onChange={(e) => setFormData({ ...formData, floor: e.target.value })} className="input-premium">
                <option value="">No Zone</option>
                {Array.from(new Set([
                  ...floors.filter(f => f.locationName === formData.location).map(f => f.name),
                  ...staff.filter(s => s.location === formData.location && s.floor).map(s => s.floor!)
                ])).sort().map(flrName => (
                  <option key={flrName} value={flrName}>{flrName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Designation</label>
              <select value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} className="input-premium">
                <option value="">No Designation</option>
                {Array.from(new Set([
                  ...designations.map(d => d.displayName),
                  ...staff.filter(s => s.designation).map(s => s.designation!)
                ])).sort().map(desigName => (
                  <option key={desigName} value={desigName}>{desigName}</option>
                ))}
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
              <label className="block text-sm font-medium text-white/70 mb-1">Email Address</label>
              <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="input-premium" placeholder="e.g. staff@company.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Date of Birth</label>
              <input type="date" value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} className="input-premium" />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Gender</label>
              <select value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })} className="input-premium">
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Emergency Contact Person</label>
              <input type="text" value={formData.emergencyContactName} onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })} className="input-premium" placeholder="Spouse / Parent Name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Emergency Phone</label>
              <input type="tel" value={formData.emergencyContactPhone} onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })} className="input-premium" placeholder="Emergency contact number" />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Address</label>
              <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="input-premium" placeholder="Full address" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-white/70 mb-1">Profile Photo</label>
              <div className="flex items-center gap-2 flex-wrap">
                {formData.photo ? (
                  <img src={formData.photo} alt="Preview" className="w-12 h-12 rounded-full object-cover border-2 border-white/30" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/40"><Users size={20} /></div>
                )}
                <label className="cursor-pointer bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                  Upload
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={startWebcam}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                >
                  <Camera size={14} /> Take Photo
                </button>
                {formData.photo && (
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, photo: '' }))} className="text-red-400 hover:text-red-300 px-2 py-1 text-xs rounded border border-red-400/50 hover:border-red-300">Remove</button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                {salaryCategories.find(c => c.id === 'basic')?.name || 'Basic Payroll'}
              </label>
              <input type="number" value={formData.basicPayroll} onChange={(e) => setFormData({ ...formData, basicPayroll: Number(e.target.value) })} className="input-premium" required />
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
              <label className="block text-sm font-medium text-white/70 mb-1">Payroll Calculation Days</label>
              <input type="number" value={formData.salaryCalculationDays} onChange={(e) => setFormData({ ...formData, salaryCalculationDays: Number(e.target.value) })} className="input-premium" min="0" max="31" />
              <p className="text-xs text-white/40 mt-0.5">0 = Fixed salary</p>
            </div>
            <div className="flex flex-col justify-end gap-2 pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.sundayPenalty} onChange={(e) => setFormData({ ...formData, sundayPenalty: e.target.checked })} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-white/30 bg-white/10" />
                <span className="text-sm font-medium text-white/70">Apply Sunday Penalty</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={formData.exemptFromLateDeduction} onChange={(e) => setFormData({ ...formData, exemptFromLateDeduction: e.target.checked })} className="w-5 h-5 text-amber-500 rounded focus:ring-amber-500 border-white/30 bg-white/10" />
                <span className="text-sm font-medium text-white/70">Exempt from Late Deduction</span>
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
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">UPI ID / VPA</label>
                  <input type="text" value={formData.upiId} onChange={(e) => setFormData({ ...formData, upiId: e.target.value })} className="input-premium" placeholder="e.g. name@okaxis" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Aadhaar Number <span className="text-white/30 text-xs">(Identity)</span></label>
                  <input type="text" value={formData.aadhaarNumber} onChange={(e) => setFormData({ ...formData, aadhaarNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 12) })} className="input-premium" placeholder="12-digit Aadhaar" maxLength={12} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">PAN Card Number <span className="text-white/30 text-xs">(Identity)</span></label>
                  <input type="text" value={formData.panNumber} onChange={(e) => setFormData({ ...formData, panNumber: e.target.value.toUpperCase().slice(0, 10) })} className="input-premium" placeholder="10-digit PAN" maxLength={10} />
                </div>
                {!hideStatutoryExtras(userRole) && formData.isStatutory && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-1">PF Number <span className="text-white/30 text-xs">(optional)</span></label>
                      <input type="text" value={formData.pfNumber} onChange={(e) => setFormData({ ...formData, pfNumber: e.target.value })} className="input-premium" placeholder="e.g. AB/CDE/1234567/000/0000001" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-1">ESI Number <span className="text-white/30 text-xs">(optional)</span></label>
                      <input type="text" value={formData.esiNumber} onChange={(e) => setFormData({ ...formData, esiNumber: e.target.value })} className="input-premium" placeholder="e.g. 1234567890" />
                    </div>
                  </>
                )}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Biometric Device ID / Employee Code <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.deviceId}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\s+/g, '');
                      setFormData({ ...formData, deviceId: val, employeeCode: val });
                    }}
                    className="input-premium"
                    placeholder="e.g. 101 (the enroll number on the eSSL / ZKTeco device)"
                    required
                  />
                  <p className="text-xs text-white/50 mt-1">
                    Required to match punches from biometric / cloud-push devices to this staff member.
                    Must exactly match the enroll number on the device.
                  </p>
                </div>
              </div>
            </div>

            {/* Hike Scheduling */}
            <div className="md:col-span-2 lg:col-span-3">
              <h3 className="text-sm font-semibold text-white/60 mb-3 border-b border-white/10 pb-2">📅 Payroll Hike Schedule (Override)</h3>
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

            {/* Statutory Compliance */}
            {!hideStatutoryExtras(userRole) && (
            <div className="md:col-span-2 lg:col-span-3">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={!!formData.isStatutory}
                  onChange={(e) => setFormData({ ...formData, isStatutory: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-white/30 bg-white/10"
                />
                <Shield size={16} className="text-emerald-400" />
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">Statutory Employee</div>
                  <div className="text-xs text-[var(--text-muted)]">Covered under statutory compliance — enables PF / ESI numbers and per-staff deductions.</div>
                </div>
              </label>
            </div>
            )}


            {!hideStatutoryExtras(userRole) && formData.isStatutory && (

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
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{def.label}</span>
                        </label>
                        <span className="text-xs text-[var(--text-muted)] flex-1 min-w-[140px]">{def.description}</span>

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
            )}

            {/* Dynamic Custom Fields Section */}
            {customFields.length > 0 && (
              <div className="md:col-span-2 lg:col-span-3">
                <h3 className="text-sm font-semibold text-purple-300 mb-3 border-b border-white/10 pb-2">✨ Custom Attributes</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customFields.map(field => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium text-white/70 mb-1">{field.label}</label>
                      {field.type === 'select' ? (
                        <select
                          value={formData.customFields?.[field.key] || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            customFields: { ...formData.customFields, [field.key]: e.target.value }
                          })}
                          className="input-premium"
                        >
                          <option value="">Select {field.label}</option>
                          {field.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                          value={formData.customFields?.[field.key] || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            customFields: { ...formData.customFields, [field.key]: e.target.value }
                          })}
                          className="input-premium"
                          placeholder={`Enter ${field.label}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="md:col-span-2 lg:col-span-3 flex gap-3">
              <button type="submit" className="btn-premium px-6 py-2">{editingStaff ? 'Update Staff' : 'Add Staff'}</button>
              <button type="button" onClick={() => { resetForm(); setEditingStaff(null); setShowAddForm(false); }} className="btn-ghost px-6 py-2">Cancel</button>
            </div>
          </form>
          </div>
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

      {/* Payroll History Modal */}
      {showSalaryHistory && (
        <div className="modal-overlay">
          <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="text-emerald-400" size={24} />
                Payroll Hike History
              </h3>
              <button onClick={() => setShowSalaryHistory(null)} className="text-white/50 hover:text-white">✕</button>
            </div>
            <SalaryHikeHistory
              salaryHikes={getStaffSalaryHikes(showSalaryHistory.id)}
              staffName={showSalaryHistory.name}
              currentSalary={showSalaryHistory.totalPayroll ?? showSalaryHistory.totalSalary ?? 0}
              currentPayroll={showSalaryHistory.totalPayroll ?? showSalaryHistory.totalSalary ?? 0}
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
                  {Object.entries(columnLabels)
                    .filter(([key]) => showEmpCode || key !== 'employeeCode')
                    .map(([key, label]) => (
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
        {/* Mobile card list — thumb-friendly, no horizontal scroll */}
        <div className="md:hidden space-y-2 pb-4">
          {activeStaff.length === 0 ? (
            <div className="p-8 text-center text-sm text-white/60">No staff to display.</div>
          ) : activeStaff.map((member, index) => (
            <div
              key={member.id}
              className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] active:opacity-80"
              onClick={(e) => {
                const t = e.target as HTMLElement;
                if (t.closest('button') || t.closest('a')) return;
                handleEdit(member);
              }}
            >
              <div className="flex items-start gap-3">
                {member.photo ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setViewImageModal({ name: member.name, photo: member.photo! }); }} className="shrink-0 cursor-pointer">
                    <img src={member.photo} alt={member.name} className="w-12 h-12 rounded-full object-cover border border-white/20 shadow-sm" />
                  </button>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-md border border-white/10">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        <span className="text-[var(--text-secondary)] mr-1.5">#{index + 1}</span>{member.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">
                        {member.designation || '—'} · <span className={getLocationColor(member.location)}>{member.location}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-emerald-400">₹{calculateMemberTotalPayroll(member).toLocaleString()}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">{member.paymentMode === 'bank' ? 'Bank' : 'Cash'}</div>
                    </div>
                  </div>
                  {showEmpCode && member.employeeCode && (
                    <div className="mt-1 text-[11px] text-[var(--text-secondary)]">Emp: <span className="font-mono text-white/80">{member.employeeCode}</span></div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Joined {new Date(member.joinedDate).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(member); }} className="p-2 rounded-lg bg-indigo-500/15 text-indigo-300 active:bg-indigo-500/30" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setFaceModalStaff(member); }} className="p-2 rounded-lg bg-purple-500/15 text-purple-300 active:bg-purple-500/30" title="Face samples">
                        <Camera size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleResetDevice(member.id, member.name); }} className="p-2 rounded-lg bg-orange-500/15 text-orange-400 active:bg-orange-500/30" title="Reset Device Lock">
                        <ShieldOff size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleResetStaffPassword(member.id, member.name); }} className="p-2 rounded-lg bg-amber-500/15 text-amber-400 active:bg-amber-500/30" title="Reset Password">
                        <RotateCcw size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(member); }} className="p-2 rounded-lg bg-red-500/15 text-red-300 active:bg-red-500/30" title="Archive">
                        <Archive size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto w-full max-w-full pb-4">

          <table className="table-premium">
            <thead>
              <tr>
                <th className="px-3 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={selectedStaffIds.length === activeStaff.length && activeStaff.length > 0}
                    onChange={toggleSelectAll}
                    className="checkbox-premium"
                    title="Select All"
                  />
                </th>
                <th className="w-10"></th>
                <th className="text-center">S.No</th>
                {showEmpCode && <th className="text-center">Emp Code</th>}
                <th className="sticky left-0">Name</th>
                {visibleColumns.location !== false && <th className="text-center">Branch</th>}
                {visibleColumns.floor !== false && <th className="text-center">Zone</th>}
                {visibleColumns.designation !== false && <th className="text-center">Designation</th>}
                {visibleColumns.experience !== false && <th className="text-center">Experience</th>}
                {visibleColumns.basic !== false && <th className="text-center">{salaryCategories.find(c => c.id === 'basic')?.name || 'Basic'}</th>}
                {visibleColumns.incentive !== false && <th className="text-center">{salaryCategories.find(c => c.id === 'incentive')?.name || 'Incentive'}</th>}
                {visibleColumns.hra !== false && <th className="text-center">{salaryCategories.find(c => c.id === 'hra')?.name || 'HRA'}</th>}
                {visibleColumns.meal !== false && <th className="text-center">{salaryCategories.find(c => c.id === 'meal_allowance')?.name || 'Meal Allowance'}</th>}
                {activeCustomCategories.map(category => (
                  <th key={category.id} className="text-center">{category.name}</th>
                ))}
                {customFields.filter(f => f.showInTable).map(cf => (
                  <th key={cf.id} className="text-center text-purple-300">{cf.label}</th>
                ))}
                {visibleColumns.total !== false && <th className="text-center">Total</th>}
                {visibleColumns.staffType !== false && <th className="text-center">Staff Type</th>}
                {visibleColumns.payment !== false && <th className="text-center">Payment</th>}
                {visibleColumns.bankName !== false && <th className="text-center">Bank Name</th>}
                {visibleColumns.accountNo !== false && <th className="text-center">Account No</th>}
                {visibleColumns.ifsc !== false && <th className="text-center">IFSC</th>}
                {visibleColumns.nextHike !== false && <th className="text-center">Next Hike</th>}
                {visibleColumns.hikeInterval !== false && <th className="text-center">Hike Interval</th>}
                {visibleColumns.salaryHistory !== false && <th className="text-center">Payroll History</th>}
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
                      // Don't trigger drawer if clicking on a button, link or interactive element
                      const target = e.target as HTMLElement;
                      if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('.cursor-grab')) return;
                      setDrawerStaff(member);
                    }}
                  >
                    <td className="px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedStaffIds.includes(member.id)}
                        onChange={() => toggleSelectStaff(member.id)}
                        className="checkbox-premium"
                      />
                    </td>
                    <td className="px-2 py-4 text-center">
                      {onUpdateStaffOrder && (
                        <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                          <GripVertical size={16} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-4 text-sm text-center">{index + 1}</td>
                    {showEmpCode && <td className="px-3 py-4 text-sm text-center">{member.employeeCode || (member.deviceId?.startsWith('dev_') ? null : member.deviceId) || '-'}</td>}
                    <td className="px-3 py-4 sticky left-0 bg-white">
                      <div>
                        <div className="text-sm font-semibold text-indigo-600 hover:underline">{member.name}</div>
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
                      <div className="flex flex-col items-center gap-1 justify-center">
                        <span>{member.designation || <span className="text-gray-400 italic">-</span>}</span>
                        {member.exemptFromLateDeduction && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30 leading-none">
                            Exempt
                          </span>
                        )}
                      </div>
                    </td>}
                    {visibleColumns.experience !== false && <td className="px-3 py-4 text-sm text-blue-600 font-medium text-center">
                      {calculateExperience(member.joinedDate)}
                    </td>}
                    {visibleColumns.basic !== false && <td className="px-3 py-4 text-sm text-center">₹{(member.basicSalary ?? member.basicPayroll ?? 0).toLocaleString()}</td>}
                    {visibleColumns.incentive !== false && <td className="px-3 py-4 text-sm text-center">₹{(member.incentive || 0).toLocaleString()}</td>}
                    {visibleColumns.hra !== false && <td className="px-3 py-4 text-sm text-center">₹{(member.hra || 0).toLocaleString()}</td>}
                    {visibleColumns.meal !== false && <td className="px-3 py-4 text-sm text-center">₹{(member.mealAllowance || 0).toLocaleString()}</td>}
                    {activeCustomCategories.map(category => (
                      <td key={category.id} className="px-3 py-4 text-sm text-center">
                        ₹{(member.salarySupplements?.[category.id] || member.salarySupplements?.[category.key] || 0).toLocaleString()}
                      </td>
                    ))}
                    {customFields.filter(f => f.showInTable).map(cf => (
                      <td key={cf.id} className="px-3 py-4 text-sm text-center text-purple-300 font-medium">
                        {member.customFields?.[cf.key] || '-'}
                      </td>
                    ))}
                    {visibleColumns.total !== false && <td className="px-3 py-4 text-sm font-semibold text-green-600 text-center">₹{calculateMemberTotalPayroll(member).toLocaleString()}</td>}
                    {visibleColumns.staffType !== false && <td className="px-3 py-4 text-sm text-center">
                      {member.staffAccommodation ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${member.staffAccommodation === 'day_scholar' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {member.staffAccommodation === 'day_scholar' ? 'Day Scholar' : 'Accommodation'}
                        </span>
                      ) : <span className="text-gray-400 italic">-</span>}
                    </td>}
                    {visibleColumns.payment !== false && <td className="px-3 py-4 text-sm text-center">
                      <span className={`badge-premium ${member.paymentMode === 'bank' ? 'badge-success' : 'badge-warning'}`}>
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
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm flex items-center justify-center mx-auto shadow-sm">
                          {member.name.charAt(0).toUpperCase()}
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
                        {member.deviceId && (
                          <button onClick={() => handleResetDevice(member.id, member.name)} className="text-orange-600 hover:text-orange-800 p-1 rounded hover:bg-orange-50" title="Reset Device Lock">
                            <ShieldOff size={16} />
                          </button>
                        )}
                        <button onClick={() => handleResetStaffPassword(member.id, member.name)} className="text-amber-600 hover:text-amber-800 p-1 rounded hover:bg-amber-50" title="Reset Password">
                          <RotateCcw size={16} />
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

      {/* Branch Manager Modal */}
      {showLocationManager && (
        <div className="modal-overlay" onClick={() => setShowLocationManager(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                <MapPin className="text-purple-400" size={18} />
                Manage Branchs
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
                placeholder="New Branch Name"
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

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {locations.map(loc => (
                <div key={loc.id} className="flex flex-col p-3 glass-card-static rounded-xl border border-white/5 space-y-3">
                  {editingLocation?.id === loc.id ? (
                    <div className="flex flex-col gap-2 w-full">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editLocationValue}
                          onChange={(e) => setEditLocationValue(e.target.value)}
                          placeholder="Branch Name"
                          className="input-premium flex-1 text-sm py-1.5"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateLocation(loc.id); if (e.key === 'Escape') setEditingLocation(null); }}
                        />
                        <button onClick={() => handleUpdateLocation(loc.id)} className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg" title="Save"><Check size={16} /></button>
                        <button onClick={() => setEditingLocation(null)} className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg" title="Cancel"><X size={16} /></button>
                      </div>
                      
                      {/* Geofencing Settings */}
                      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex flex-col gap-2">
                        <label className="text-xs font-semibold text-blue-300">Geofencing Validation (Optional)</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="number"
                            value={editLocationLat}
                            onChange={(e) => setEditLocationLat(e.target.value ? Number(e.target.value) : '')}
                            placeholder="Latitude (e.g. 28.7041)"
                            className="input-premium flex-1 min-w-[120px] text-xs py-1.5"
                            step="any"
                          />
                          <input
                            type="number"
                            value={editLocationLng}
                            onChange={(e) => setEditLocationLng(e.target.value ? Number(e.target.value) : '')}
                            placeholder="Longitude (e.g. 77.1025)"
                            className="input-premium flex-1 min-w-[120px] text-xs py-1.5"
                            step="any"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editLocationRadius}
                              onChange={(e) => setEditLocationRadius(e.target.value ? Number(e.target.value) : '')}
                              placeholder="Radius"
                              className="input-premium w-20 text-xs py-1.5"
                            />
                            <span className="text-[10px] text-blue-200">meters</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-blue-200/50">Restrict mobile face attendance to this zone. Leave blank to disable.</p>
                      </div>

                      {/* Device Settings */}
                      <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex flex-col gap-2">
                        <label className="text-xs font-semibold text-indigo-300">Biometric Device (eSSL/ZKTeco) Settings</label>
                        <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editLocationIp}
                              onChange={(e) => setEditLocationIp(e.target.value)}
                              placeholder="Device IP (e.g. 192.168.1.100)"
                              className="input-premium flex-1 text-xs py-1.5"
                            />
                            <input
                              type="number"
                              value={editLocationPort}
                              onChange={(e) => setEditLocationPort(Number(e.target.value))}
                              placeholder="Port (4370)"
                              className="input-premium w-20 text-xs py-1.5"
                            />
                        </div>
                        <p className="text-[10px] text-white/50">Leave IP blank if this location has no biometric device.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[var(--text-primary)]">{loc.name}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { 
                                setEditingLocation(loc); 
                                setEditLocationValue(loc.name); 
                                setEditLocationIp(loc.device_ip || ''); 
                                setEditLocationPort(loc.device_port || 4370);
                                setEditLocationLat(loc.latitude ?? '');
                                setEditLocationLng(loc.longitude ?? '');
                                setEditLocationRadius(loc.radius_meters ?? '');
                              }}
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
                      </div>
                      
                      {loc.device_ip && (
                          <div className="flex flex-col gap-1 mt-1 p-2 bg-black/20 rounded-lg border border-white/5">
                              <div className="flex items-center justify-between text-xs">
                                  <span className="text-indigo-400 font-mono">TCP {loc.device_ip}:{loc.device_port || 4370}</span>
                                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold tracking-wider">eSSL SYNC ACTIVE</span>
                              </div>
                              {loc.last_sync_time && (
                                  <span className="text-[10px] text-white/40">Last Synced: {new Date(loc.last_sync_time).toLocaleString('en-GB')}</span>
                              )}
                          </div>
                      )}
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

      {/* Payroll Category Manager Modal */}
      {showCategoryManager && (
        <div className="modal-overlay" onClick={() => setShowCategoryManager(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                <DollarSign className="text-emerald-400" size={18} />
                Manage Payroll Categories
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

      {/* Zone Manager Modal */}
      {showFloorManager && (
        <div className="modal-overlay" onClick={() => setShowFloorManager(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                <Layers className="text-cyan-400" size={18} />
                Manage Zones
              </h3>
              <button onClick={() => setShowFloorManager(false)} className="text-white/50 hover:text-white p-1"><X size={20} /></button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <select
                value={newFloorLocation}
                onChange={(e) => setNewFloorLocation(e.target.value)}
                className="input-premium flex-1 min-w-0 text-sm sm:min-w-[140px]"
              >
                <option value="">Select Branch</option>
                <option value="ALL">All Branchs</option>
                {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
              <input
                type="text"
                value={newFloor}
                onChange={(e) => setNewFloor(e.target.value)}
                placeholder="Zone Name"
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
                          <div className="flex-1 flex flex-col gap-1 mr-2">
                            <div className="flex gap-2">
                              <input type="text" value={editFloorValue} onChange={(e) => setEditFloorValue(e.target.value)} className="input-premium flex-1 text-sm py-1" autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateFloor(floor.id); if (e.key === 'Escape') setEditingFloor(null); }} />
                              <button onClick={() => handleUpdateFloor(floor.id)} className="p-1 text-emerald-400"><Check size={16} /></button>
                              <button onClick={() => setEditingFloor(null)} className="p-1 text-red-400"><X size={16} /></button>
                            </div>
                            <label className="text-[10px] text-white/50 flex items-center gap-1 cursor-pointer">
                              <input type="checkbox" checked={applyToAllLocations} onChange={(e) => setApplyToAllLocations(e.target.checked)} className="rounded bg-white/10 border-white/20" />
                              Apply to all locations
                            </label>
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
                {confirmDialog.action === 'restore' ? 'Restore' : 'Delete'} {confirmDialog.type === 'location' ? 'Branch' : confirmDialog.type === 'floor' ? 'Zone' : confirmDialog.type === 'designation' ? 'Designation' : 'Category'}?
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
            {confirmDialog.type === 'floor' && confirmDialog.action === 'delete' && (
              <label className="flex items-center justify-center gap-2 mb-6 text-sm text-white/70 cursor-pointer hover:text-white">
                <input type="checkbox" checked={applyDeleteToAllLocations} onChange={(e) => setApplyDeleteToAllLocations(e.target.checked)} className="rounded bg-white/10 border-white/20" />
                Delete from all locations
              </label>
            )}
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
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Email</label>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-primary)] font-mono">{credentialsModal.credentials.email}</span>
                  <button
                    onClick={() => copyToClipboard(credentialsModal.credentials.email, 'email')}
                    className={`p-2 rounded-lg transition-colors ${copiedField === 'email' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                  >
                    {copiedField === 'email' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <div className="glass-card-static p-4 rounded-xl">
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Password</label>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-primary)] font-mono">{credentialsModal.credentials.password}</span>
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
            if (onRefreshStaff) await onRefreshStaff?.();
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
      {/* Live Webcam Photo Capture Modal */}
      {showWebcamModal && (
        <div className="modal-overlay" onClick={stopWebcam}>
          <div className="modal-content max-w-lg text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Camera size={18} className="text-purple-400" />
                Capture Profile Photo
              </h3>
              <button onClick={stopWebcam} className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-white/10 mb-4 flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            </div>
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={stopWebcam} className="btn-ghost px-4 py-2 text-xs">
                Cancel
              </button>
              <button
                type="button"
                onClick={snapWebcamPhoto}
                className="btn-premium px-6 py-2 text-xs bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-xl font-semibold flex items-center gap-2 shadow-lg"
              >
                <Camera size={16} /> Snap Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Custom Fields Definition Manager Modal */}
      <CustomFieldsManagerModal
        isOpen={showCustomFieldsModal}
        onClose={() => setShowCustomFieldsModal(false)}
        fields={customFields}
        onFieldsChange={setCustomFields}
      />

      {/* 360 Degree Employee Profile Drawer */}
      <StaffProfileDrawer
        staff={drawerStaff}
        isOpen={!!drawerStaff}
        onClose={() => setDrawerStaff(null)}
        onEdit={handleEdit}
        salaryHikes={salaryHikes}
        customFields={customFields}
        getLocationColor={getLocationColor}
        calculateMemberTotalPayroll={calculateMemberTotalPayroll}
      />

      {/* Multi-Select Floating Bulk Actions Bar */}
      <StaffBulkActionBar
        selectedStaff={staff.filter(s => selectedStaffIds.includes(s.id))}
        locations={locations}
        designations={designations}
        onClearSelection={() => setSelectedStaffIds([])}
        onBatchUpdateBranch={handleBatchUpdateBranch}
        onBatchUpdateDesignation={handleBatchUpdateDesignation}
        onBatchDelete={handleBatchDelete}
        onExportSelected={handleExportSelected}
      />
    </div>
  );
};

export default StaffManagement;
