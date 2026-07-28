import { type Company, type Country, type User } from "@prisma/client";

/** Компания с (опционально) подгруженным справочником страны. */
type CompanyWithCountry = Company & { country?: Country | null };

export const toCompanyDto = (company: CompanyWithCountry) => ({
  id: company.id,
  name: company.name,
  address: company.address,
  phone: company.phone,
  country_code: company.countryCode,
  // Имя страны живёт в справочнике; присутствует, если relation подгружен.
  country: company.country?.name ?? null,
  ogrn: company.ogrn,
  ogrnip: company.ogrnip,
  kpp: company.kpp,
  inn: company.inn,
  logo_url: company.logoUrl,
});

export const toUserDto = (user: User & { company?: CompanyWithCountry | null }) => ({
  id: user.id,
  full_name: user.fullName,
  phone: user.phone,
  email: user.email,
  office_address: user.officeAddress,
  role: user.role,
  is_blocked: user.isBlocked,
  employee_number: user.employeeNumber,
  company_id: user.companyId,
  company: user.company ? toCompanyDto(user.company) : null,
  created_at: user.createdAt,
  updated_at: user.updatedAt,
});
