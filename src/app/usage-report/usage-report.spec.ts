import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UsageReportComponent } from './usage-report';

describe('UsageReportComponent', () => {
  let component: UsageReportComponent;
  let fixture: ComponentFixture<UsageReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsageReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UsageReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});